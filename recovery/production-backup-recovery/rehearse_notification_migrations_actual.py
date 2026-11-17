#!/usr/bin/env python3
"""Restore the pinned November 15 archive, then rehearse candidate SQL locally.

This script uses the existing PFBAK01 coordinator and its secure controlling-TTY
prompt. It never connects to Production and uses a PostgreSQL container with
Docker network mode none. No provider or scheduler jobs are executed.
"""
from __future__ import annotations

import hashlib
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
import uuid

REPO = Path(__file__).resolve().parents[2]
BACKUP = Path.home() / "Library/Application Support/Project Flour/Backups/production-full-20261115T152443Z-5b9a8ac0"
MIGRATIONS_DIR = REPO / "recovery/candidates/notification-migrations"
EVIDENCE_DIR = REPO / "recovery/evidence"
RESTORE_DIR = REPO / "recovery/production-backup-recovery"
sys.path.insert(0, str(RESTORE_DIR))
import restore_backup_isolated as restore  # noqa: E402

MIGRATIONS = [
    ("20261109110501", "20261109110501_staff_notification_sound_preference.sql", "a4896ed87b0e621dbb0bdbb4f82e52e3dcc0d3296ec5bd0ece7baf21354e5dbf"),
    ("20261109193000", "20261109193000_staff_notification_push.sql", "3b4ac6f19706bf9356500abfddf478cc14b09e25275162448a5b474d30904339"),
    ("20261109213004", "20261109213004_staff_notification_preferences_revoke_client_truncate.sql", "339bc9ba869ab7315aa80fce0b559781c7a54138863487f60980bf6da5ef511d"),
    ("20261111110823", "20261111110823_staff_notification_fresh_pick_push_handoff.sql", "7f21442519475cf9ea6736fc7b3c2839495a6df7bad86ef420e4e60006cc4a57"),
    # New provenance/version. This does not recreate missing 20261114120000.
    ("20261116120000", "20261116120000_staff_notification_push_event_scope_reconstructed.sql", "659e234d2144533ae2044a8b64bb6a5a0157ff39134bdf319b4b0865815d1ff3"),
]
ARCHIVES = dict(restore.EXPECTED_HASHES)

BASELINE_SQL = r"""
SELECT current_setting('server_version_num')||'|'||current_user||'|'||
       (SELECT oid::text FROM pg_authid WHERE rolname=current_user)||'|'||
       (SELECT rolname FROM pg_roles WHERE oid=(SELECT datdba FROM pg_database WHERE datname=current_database()));
SELECT count(*)||'|'||count(DISTINCT version)||'|'||max(version)::text||'|'||
       count(*) FILTER (WHERE version::text IN ('20261109110501','20261109193000','20261109213004','20261111110823','20261114120000','20261116120000'))
FROM supabase_migrations.schema_migrations;
"""

DATA_SNAPSHOT_SQL = r"""
CREATE TEMP TABLE pf_data_snapshot(schema_name text, table_name text, row_count bigint, digest text);
DO $pf$
DECLARE r record; row_expr text; stmt text;
BEGIN
  FOR r IN SELECT schemaname, tablename FROM pg_catalog.pg_tables
           WHERE schemaname NOT IN ('pg_catalog','information_schema')
             AND schemaname NOT LIKE 'pg_temp_%' AND schemaname NOT LIKE 'pg_toast_temp_%'
             AND tablename NOT LIKE 'staff_notification_push_%'
           ORDER BY schemaname, tablename
  LOOP
    IF r.schemaname='public' AND r.tablename='staff_notification_preferences' THEN
      row_expr := '(to_jsonb(t)-ARRAY[''sound_enabled'',''push_enabled'',''push_enabled_at'']::text[])::text';
    ELSE
      row_expr := 'to_jsonb(t)::text';
    END IF;
    stmt := format(
      'INSERT INTO pg_temp.pf_data_snapshot SELECT %L,%L,count(*),md5(coalesce(string_agg(%s,E''\n'' ORDER BY %s),'''')) FROM %I.%I AS t',
      r.schemaname,r.tablename,row_expr,row_expr,r.schemaname,r.tablename);
    EXECUTE stmt;
  END LOOP;
END $pf$;
SELECT coalesce(jsonb_agg(jsonb_build_object('schema',schema_name,'table',table_name,'rows',row_count,'digest',digest)
                          ORDER BY schema_name,table_name),'[]'::jsonb)::text
FROM pf_data_snapshot;
"""

STRUCTURE_SQL = r"""
SELECT
 (SELECT count(*)::text||'|'||md5(coalesce(string_agg(n.nspname||'.'||c.relname||'|'||c.relkind::text||'|'||r.rolname||'|'||
   coalesce(c.relacl::text,'')||'|'||c.relrowsecurity::text||'|'||c.relforcerowsecurity::text,E'\n' ORDER BY n.nspname,c.relname),''))
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner
  WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND c.relkind IN ('r','p','v','m','S','f')
    AND c.relname NOT LIKE 'staff_notification_push_%' AND c.relname<>'staff_notification_preferences')
 ||'|'||
 (SELECT count(*)::text||'|'||md5(coalesce(string_agg(n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')|'||
   r.rolname||'|'||p.prosecdef::text||'|'||coalesce(array_to_string(p.proconfig,','),'')||'|'||coalesce(p.proacl::text,''),
   E'\n' ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)),''))
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner
  WHERE n.nspname NOT IN ('pg_catalog','information_schema')
    AND p.proname NOT IN ('register_staff_notification_push_subscription','queue_staff_notification_push_deliveries',
      'claim_staff_notification_push_deliveries','complete_staff_notification_push_delivery',
      'list_due_fresh_pick_hold_reminder_push_event_ids','suppress_stale_fresh_pick_hold_reminder_push_deliveries')
    AND (p.proname NOT LIKE 'staff_notification_%' OR p.proname IN
      ('staff_notification_fresh_pick_hold_reminder_is_current','claim_staff_notification_email_deliveries',
       'complete_staff_notification_email_delivery','suppress_staff_notification_email_delivery')))
 ||'|'||
 (SELECT count(*)::text||'|'||md5(coalesce(string_agg(schemaname||'.'||tablename||'|'||policyname||'|'||permissive||'|'||
   roles::text||'|'||cmd||'|'||coalesce(qual,'')||'|'||coalesce(with_check,''),E'\n' ORDER BY schemaname,tablename,policyname),''))
  FROM pg_policies WHERE tablename NOT LIKE 'staff_notification_push_%')
 ||'|'||
 (SELECT count(*)::text||'|'||md5(coalesce(string_agg(n.nspname||'.'||c.relname||'|'||t.tgname||'|'||t.tgenabled::text||'|'||
   pg_get_triggerdef(t.oid)||'|'||p.proname,E'\n' ORDER BY n.nspname,c.relname,t.tgname),''))
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid
  WHERE NOT t.tgisinternal AND n.nspname NOT IN ('pg_catalog','information_schema')
    AND c.relname NOT LIKE 'staff_notification_push_%'
    AND t.tgname NOT IN ('staff_notification_preferences_push_enabled_at','staff_notification_revoke_inactive_push'))
 ||'|'||
 (SELECT count(*)::text||'|'||md5(coalesce(string_agg(n.nspname||'.'||c.relname||'|'||con.conname||'|'||con.contype::text||'|'||
   pg_get_constraintdef(con.oid)||'|'||con.convalidated::text,E'\n' ORDER BY n.nspname,c.relname,con.conname),''))
  FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND c.relname NOT LIKE 'staff_notification_push_%')
 ||'|'||
 (SELECT count(*)::text||'|'||md5(coalesce(string_agg(grantor.rolname||'|'||member.rolname||'|'||role.rolname||'|'||
   m.admin_option||'|'||m.inherit_option||'|'||m.set_option,E'\n' ORDER BY grantor.rolname,member.rolname,role.rolname),''))
  FROM pg_auth_members m JOIN pg_roles role ON role.oid=m.roleid JOIN pg_roles member ON member.oid=m.member
  JOIN pg_roles grantor ON grantor.oid=m.grantor);
"""

CRON_SQL = r"""
SELECT coalesce(jsonb_agg(jsonb_build_object('name',jobname,'active',active) ORDER BY jobname),'[]'::jsonb)::text
FROM cron.job;
"""

PREF_PRE_SQL = r"""
SELECT jsonb_build_object(
 'rows',count(*),
 'categories',coalesce((SELECT jsonb_object_agg(notification_code,jsonb_build_object('rows',n,'email_enabled',email_on))
   FROM (SELECT notification_code,count(*) n,count(*) FILTER(WHERE email_enabled) email_on
     FROM public.staff_notification_preferences GROUP BY notification_code) x),'{}'::jsonb),
 'duplicate_staff_category_groups',(SELECT count(*) FROM (SELECT staff_id,notification_code FROM public.staff_notification_preferences GROUP BY 1,2 HAVING count(*)>1) d),
 'orphan_staff_rows',(SELECT count(*) FROM public.staff_notification_preferences p LEFT JOIN public.staff_profiles s ON s.id=p.staff_id WHERE s.id IS NULL),
 'client_truncate_anon',has_table_privilege('anon','public.staff_notification_preferences','TRUNCATE'),
 'client_truncate_authenticated',has_table_privilege('authenticated','public.staff_notification_preferences','TRUNCATE'),
 'owner',(SELECT owner_role.rolname FROM pg_class c JOIN pg_roles owner_role ON owner_role.oid=c.relowner
   WHERE c.oid='public.staff_notification_preferences'::regclass),
 'rls',(SELECT relrowsecurity FROM pg_class WHERE oid='public.staff_notification_preferences'::regclass),
 'force_rls',(SELECT relforcerowsecurity FROM pg_class WHERE oid='public.staff_notification_preferences'::regclass),
 'crud_privileges',(SELECT jsonb_agg(jsonb_build_object('role',r.role_name,'privilege',p.privilege_name,
   'allowed',has_table_privilege(r.role_name,'public.staff_notification_preferences',p.privilege_name)) ORDER BY r.role_name,p.privilege_name)
   FROM (VALUES('anon'),('authenticated'),('service_role')) r(role_name)
   CROSS JOIN (VALUES('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE')) p(privilege_name)),
 'email_dispatch_sweep_active',(SELECT active FROM cron.job WHERE jobname='staff-notification-email-dispatch-sweep' LIMIT 1)
)::text FROM public.staff_notification_preferences;
"""

PREF_SQL = r"""
SELECT jsonb_build_object(
 'rows',count(*),
 'categories',coalesce((SELECT jsonb_object_agg(notification_code,jsonb_build_object(
   'rows',n,'email_enabled',email_on,'sound_enabled',sound_on,'push_enabled',push_on,'push_enabled_at_nonnull',push_at))
   FROM (SELECT notification_code,count(*) n,count(*) FILTER(WHERE email_enabled) email_on,
     count(*) FILTER(WHERE sound_enabled) sound_on,count(*) FILTER(WHERE push_enabled) push_on,
     count(*) FILTER(WHERE push_enabled_at IS NOT NULL) push_at
     FROM public.staff_notification_preferences GROUP BY notification_code) x),'{}'::jsonb),
 'duplicate_staff_category_groups',(SELECT count(*) FROM (SELECT staff_id,notification_code FROM public.staff_notification_preferences GROUP BY 1,2 HAVING count(*)>1) d),
 'orphan_staff_rows',(SELECT count(*) FROM public.staff_notification_preferences p LEFT JOIN public.staff_profiles s ON s.id=p.staff_id WHERE s.id IS NULL),
 'client_truncate_anon',has_table_privilege('anon','public.staff_notification_preferences','TRUNCATE'),
 'client_truncate_authenticated',has_table_privilege('authenticated','public.staff_notification_preferences','TRUNCATE'),
 'owner',(SELECT owner_role.rolname FROM pg_class c JOIN pg_roles owner_role ON owner_role.oid=c.relowner
   WHERE c.oid='public.staff_notification_preferences'::regclass),
 'rls',(SELECT relrowsecurity FROM pg_class WHERE oid='public.staff_notification_preferences'::regclass),
 'force_rls',(SELECT relforcerowsecurity FROM pg_class WHERE oid='public.staff_notification_preferences'::regclass),
 'crud_privileges',(SELECT jsonb_agg(jsonb_build_object('role',r.role_name,'privilege',p.privilege_name,
   'allowed',has_table_privilege(r.role_name,'public.staff_notification_preferences',p.privilege_name)) ORDER BY r.role_name,p.privilege_name)
   FROM (VALUES('anon'),('authenticated'),('service_role')) r(role_name)
   CROSS JOIN (VALUES('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE')) p(privilege_name)),
 'email_dispatch_sweep_active',(SELECT active FROM cron.job WHERE jobname='staff-notification-email-dispatch-sweep' LIMIT 1)
)::text FROM public.staff_notification_preferences;
"""

SECURITY_SQL = r"""
SELECT jsonb_build_object(
 'push_tables',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'owner',owner_role.rolname,'rls',c.relrowsecurity,
   'anon_select',has_table_privilege('anon',c.oid,'SELECT'),'anon_insert',has_table_privilege('anon',c.oid,'INSERT'),
   'anon_update',has_table_privilege('anon',c.oid,'UPDATE'),'anon_delete',has_table_privilege('anon',c.oid,'DELETE'),
   'authenticated_select',has_table_privilege('authenticated',c.oid,'SELECT'),'authenticated_insert',has_table_privilege('authenticated',c.oid,'INSERT'),
   'authenticated_update',has_table_privilege('authenticated',c.oid,'UPDATE'),'authenticated_delete',has_table_privilege('authenticated',c.oid,'DELETE'),
   'service_role_select',has_table_privilege('service_role',c.oid,'SELECT'),'service_role_insert',has_table_privilege('service_role',c.oid,'INSERT'),
   'service_role_update',has_table_privilege('service_role',c.oid,'UPDATE'),'service_role_delete',has_table_privilege('service_role',c.oid,'DELETE')) ORDER BY c.relname)
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles owner_role ON owner_role.oid=c.relowner WHERE n.nspname='public' AND c.relname IN ('staff_notification_push_subscriptions','staff_notification_push_deliveries')),
 'push_functions',(SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'owner',owner_role.rolname,'security_definer',p.prosecdef,
   'search_path_public',coalesce(array_to_string(p.proconfig,','),'') LIKE '%search_path=public%',
   'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),
   'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
   'service_role_execute',has_function_privilege('service_role',p.oid,'EXECUTE')) ORDER BY p.proname,pg_get_function_identity_arguments(p.oid))
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles owner_role ON owner_role.oid=p.proowner WHERE n.nspname='public' AND p.proname IN
    ('register_staff_notification_push_subscription','queue_staff_notification_push_deliveries',
     'claim_staff_notification_push_deliveries','complete_staff_notification_push_delivery',
     'list_due_fresh_pick_hold_reminder_push_event_ids','suppress_stale_fresh_pick_hold_reminder_push_deliveries')),
 'push_triggers',(SELECT jsonb_agg(jsonb_build_object('name',t.tgname,'table',c.relname,'enabled',t.tgenabled::text,
   'definition',pg_get_triggerdef(t.oid),'function',p.proname) ORDER BY t.tgname)
   FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_proc p ON p.oid=t.tgfoid
   WHERE NOT t.tgisinternal AND t.tgname IN ('staff_notification_preferences_push_enabled_at','staff_notification_revoke_inactive_push')),
 'push_trigger_functions',(SELECT jsonb_agg(jsonb_build_object('name',p.proname,'owner',owner_role.rolname,'security_definer',p.prosecdef,
   'search_path',coalesce(array_to_string(p.proconfig,','),''),'acl',coalesce(p.proacl::text,''),
   'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),
   'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
   'service_role_execute',has_function_privilege('service_role',p.oid,'EXECUTE')) ORDER BY p.proname)
   FROM pg_proc p JOIN pg_roles owner_role ON owner_role.oid=p.proowner
   WHERE p.proname IN ('staff_notification_set_push_enabled_at','staff_notification_revoke_inactive_push')),
 'sound_default',(SELECT column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='staff_notification_preferences' AND column_name='sound_enabled'),
 'push_default',(SELECT column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='staff_notification_preferences' AND column_name='push_enabled'),
 'fresh_pick_predicate',(SELECT p.oid::regprocedure::text||'|'||md5(pg_get_functiondef(p.oid))||'|'||coalesce(array_to_string(p.proconfig,','),'')
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='staff_notification_fresh_pick_hold_reminder_is_current' LIMIT 1)
)::text;
"""

FLAG_SQL = r"""
CREATE TEMP TABLE pf_flags(schema_name text,table_name text,column_name text,total bigint,true_rows bigint,false_rows bigint,null_rows bigint);
DO $pf$
DECLARE r record; q text;
BEGIN
 FOR r IN
  SELECT table_schema,table_name,column_name FROM information_schema.columns
  WHERE table_schema NOT IN ('pg_catalog','information_schema') AND data_type='boolean'
    AND (table_name ~* '(notification|fresh.?pick|schedule|dispatch)' OR column_name ~* '(push_enabled|sound_enabled|dispatch_enabled|schedule_enabled)')
    AND column_name ~* '(enabled|active|schedule|dispatch|push|sound)'
  ORDER BY table_schema,table_name,column_name
 LOOP
  q:=format('INSERT INTO pg_temp.pf_flags SELECT %L,%L,%L,count(*),count(*) FILTER(WHERE %I),count(*) FILTER(WHERE NOT %I),count(*) FILTER(WHERE %I IS NULL) FROM %I.%I',
    r.table_schema,r.table_name,r.column_name,r.column_name,r.column_name,r.column_name,r.table_schema,r.table_name);
  EXECUTE q;
 END LOOP;
END $pf$;
SELECT coalesce(jsonb_agg(jsonb_build_object('schema',schema_name,'table',table_name,'column',column_name,'rows',total,'true',true_rows,'false',false_rows,'null',null_rows)
                          ORDER BY schema_name,table_name,column_name),'[]'::jsonb)::text
FROM pf_flags;
"""

BEHAVIOR_SQL = r"""
BEGIN;
DO $pf$
DECLARE v_staff uuid; v_event1 uuid := '__E1__'::uuid; v_event2 uuid := '__E2__'::uuid;
 v_stale uuid := '__ES__'::uuid; v_sub1 uuid := '__S1__'::uuid; v_sub2 uuid := '__S2__'::uuid; v_n integer;
BEGIN
 SELECT s.id INTO v_staff FROM public.staff_profiles s
 JOIN public.staff_notification_preferences n ON n.staff_id=s.id AND n.notification_code='new_order'
 JOIN public.staff_notification_preferences f ON f.staff_id=s.id AND f.notification_code='fresh_pick_walk_in_hold_reminder'
 WHERE s.is_active AND s.archived_at IS NULL ORDER BY s.id LIMIT 1;
 IF v_staff IS NULL THEN RAISE EXCEPTION 'no eligible test profile'; END IF;
 UPDATE public.staff_notification_preferences SET push_enabled=true
  WHERE staff_id=v_staff AND notification_code IN ('new_order','fresh_pick_walk_in_hold_reminder');
 INSERT INTO public.staff_notification_events(
   id,event_key,code,title,description,href,payload,created_at
 ) VALUES
  (v_event1,'pf-rehearsal:'||v_event1::text,'new_order','Synthetic event fixture','', '/owner','{}'::jsonb,clock_timestamp()),
  (v_event2,'pf-rehearsal:'||v_event2::text,'new_order','Synthetic event fixture','', '/owner','{}'::jsonb,clock_timestamp()),
  (v_stale,'pf-rehearsal:'||v_stale::text,'fresh_pick_walk_in_hold_reminder','Synthetic event fixture','', '/owner','{}'::jsonb,clock_timestamp());
 INSERT INTO public.staff_notification_push_subscriptions(id,staff_id,endpoint,p256dh,auth_secret,created_at)
 VALUES (v_sub1,v_staff,'https://invalid.example/pf-rehearsal/'||v_sub1,repeat('p',80),repeat('a',16),clock_timestamp()-interval '1 minute'),
        (v_sub2,v_staff,'https://invalid.example/pf-rehearsal/'||v_sub2,repeat('q',80),repeat('b',16),clock_timestamp()-interval '1 minute');
 v_n:=public.queue_staff_notification_push_deliveries(v_event1,10);
 IF v_n<>2 THEN RAISE EXCEPTION 'event1 queue count mismatch'; END IF;
 IF public.queue_staff_notification_push_deliveries(v_event1,10)<>0 THEN RAISE EXCEPTION 'queue idempotency failed'; END IF;
 IF (SELECT count(*) FROM public.staff_notification_push_deliveries WHERE event_id=v_event2)<>0 THEN RAISE EXCEPTION 'queue escaped event1'; END IF;
 IF public.queue_staff_notification_push_deliveries(v_event2,10)<>2 THEN RAISE EXCEPTION 'event2 queue failed'; END IF;
 IF public.queue_staff_notification_push_deliveries(v_stale,10)<>0 THEN RAISE EXCEPTION 'stale Fresh Pick event queued'; END IF;
 IF EXISTS(SELECT 1 FROM public.list_due_fresh_pick_hold_reminder_push_event_ids(100) WHERE event_id=v_stale) THEN
   RAISE EXCEPTION 'stale Fresh Pick event appeared in due list'; END IF;
 INSERT INTO public.staff_notification_push_deliveries(event_id,staff_id,subscription_id,status)
 VALUES(v_stale,v_staff,v_sub1,'pending');
 SELECT count(*) INTO v_n FROM public.claim_staff_notification_push_deliveries(10,v_event1,120);
 IF v_n<>2 THEN RAISE EXCEPTION 'event1 claim count mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM public.staff_notification_push_deliveries WHERE event_id=v_event2 AND status<>'pending') THEN RAISE EXCEPTION 'claim escaped event1'; END IF;
 IF (SELECT status FROM public.staff_notification_push_deliveries WHERE event_id=v_stale)<>'pending' THEN RAISE EXCEPTION 'claim altered another event'; END IF;
 IF (SELECT count(*) FROM public.claim_staff_notification_push_deliveries(10,v_stale,120))<>0 THEN RAISE EXCEPTION 'stale event claimed'; END IF;
 IF (SELECT status FROM public.staff_notification_push_deliveries WHERE event_id=v_stale)<>'suppressed' THEN RAISE EXCEPTION 'stale event not suppressed'; END IF;
 BEGIN
  PERFORM public.queue_staff_notification_push_deliveries(NULL,10);
  RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='null queue unexpectedly accepted';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
 BEGIN
  PERFORM * FROM public.claim_staff_notification_push_deliveries(10,NULL,120);
  RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='null claim unexpectedly accepted';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
END $pf$;
ROLLBACK;
SELECT 'EVENT_SCOPE_QUEUE_CLAIM_IDEMPOTENCY_STALE_HOLD_NULL_ID=PASS';
"""


class Report:
    def __init__(self, path: Path):
        self.path = path
        self.data = {
            "schema": "project-flour-actual-backup-notification-migration-rehearsal-v1",
            "status": "RUNNING",
            "started_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "production_connection": "NONE",
            "production_write": "NONE",
            "notification_dispatch": "NONE",
            "archive_hashes": {},
            "migration_stages": [],
            "checks": {},
            "limitations": [],
        }
        self.flush(create=True)

    def flush(self, create=False):
        flags = os.O_WRONLY | (os.O_CREAT | os.O_EXCL if create else os.O_TRUNC)
        if hasattr(os, "O_NOFOLLOW"):
            flags |= os.O_NOFOLLOW
        fd = os.open(self.path, flags, 0o600)
        try:
            os.fchmod(fd, 0o600)
            data = (json.dumps(self.data, sort_keys=True, indent=2) + "\n").encode()
            view = memoryview(data)
            while view:
                view = view[os.write(fd, view):]
            os.fsync(fd)
        finally:
            os.close(fd)


def sha256(path: Path):
    h = hashlib.sha256()
    size = 0
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            size += len(block)
            h.update(block)
    return h.hexdigest(), size


def preflight_only():
    restore._check_private_directory(BACKUP)
    manifest_path = BACKUP / "manifest.json"
    restore._check_private_regular_file(manifest_path)
    manifest = json.loads(manifest_path.read_text())
    restore._validate_manifest(BACKUP, manifest, ARCHIVES, (44, 88668762))
    candidate_rows = []
    for version, filename, expected in MIGRATIONS:
        digest, size = sha256(MIGRATIONS_DIR / filename)
        if digest != expected:
            raise RuntimeError("migration_hash_mismatch: Pinned migration source differs")
        candidate_rows.append({"version": version, "filename": filename, "sha256": digest, "bytes": size})
    docker = shutil.which("docker")
    if not docker:
        raise RuntimeError("docker_unavailable: Docker executable not found")
    context_sha = restore._verify_local_docker(docker)
    docker_disk = Path.home() / "Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw"
    if not docker_disk.is_file():
        raise RuntimeError("docker_storage_path_unverified: Docker backing file does not exist at qualified path")
    if os.stat(BACKUP).st_dev != os.stat(docker_disk).st_dev:
        raise RuntimeError("docker_storage_volume_changed: Backup and Docker no longer share the qualified volume")
    backup_free = shutil.disk_usage(BACKUP).free
    docker_free = shutil.disk_usage(docker_disk).free
    if min(backup_free, docker_free) < 3 * 1024 * 1024 * 1024:
        raise RuntimeError("disk_space_below_qualified_floor: Less than 3 GiB available")
    return {
        "status": "PASS", "production_connection": "NONE", "password_prompted": False,
        "backup_hashes_and_manifest": "PASS", "docker_local_context_sha256": context_sha,
        "pinned_image": restore.PINNED_IMAGE, "pinned_image_id": restore.PINNED_IMAGE_ID,
        "backup_free_bytes": backup_free, "docker_volume_free_bytes": docker_free,
        "source_archives_modified": False, "candidate_migrations": candidate_rows,
    }


class RehearsalCheckError(RuntimeError):
    def __init__(self, code: str, subprocess_exit_status: int | None = None,
                 safe_diagnostic: str | None = None, sqlstate: str | None = None,
                 safe_error_category: str | None = None):
        super().__init__(code)
        self.code = code
        self.subprocess_exit_status = subprocess_exit_status
        self.safe_diagnostic = safe_diagnostic
        self.sqlstate = sqlstate
        self.safe_error_category = safe_error_category


_SQLSTATE_RE = re.compile(r"^ERROR:\s+([0-9A-Z]{5}):\s*(.*)$", re.MULTILINE)
_SQLSTATE_LABELS = {
    "22023": "invalid_parameter_value",
    "23502": "not_null_violation",
    "23503": "foreign_key_violation",
    "23505": "unique_violation",
    "23514": "check_violation",
    "42P01": "undefined_table",
    "42703": "undefined_column",
    "42883": "undefined_function",
    "P0001": "raised_exception",
}
_SQLSTATE_CLASS_LABELS = {
    "08": "connection_exception", "22": "data_exception",
    "23": "integrity_constraint_violation", "28": "authorization_error",
    "40": "transaction_rollback", "42": "syntax_or_access_rule_error",
    "53": "insufficient_resources", "55": "object_state_error",
    "57": "operator_intervention", "58": "system_error",
    "XX": "internal_error", "P0": "procedural_error",
}


def _safe_psql_diagnostic(stderr: bytes, *, event_behavior: bool = False) -> str:
    """Return a fixed safe diagnostic; never retain PostgreSQL's raw error text."""
    text = stderr.decode("utf-8", errors="replace")
    match = _SQLSTATE_RE.search(text)
    if not match:
        return "postgres_sql_error_unclassified"
    sqlstate, primary = match.groups()
    category = _SQLSTATE_LABELS.get(sqlstate, _SQLSTATE_CLASS_LABELS.get(sqlstate[:2], "other_sql_error"))
    if event_behavior:
        expected = (
            "no eligible test profile", "event1 queue count mismatch", "queue idempotency failed",
            "queue escaped event1", "event2 queue failed", "stale Fresh Pick event queued",
            "stale Fresh Pick event appeared in due list", "event1 claim count mismatch", "claim escaped event1",
            "claim altered another event", "stale event claimed", "stale event not suppressed",
            "null queue unexpectedly accepted", "null claim unexpectedly accepted",
        )
        for message in expected:
            if primary == message:
                assertion = "event_behavior_assertion_" + message.replace(" ", "_")
                return f"{assertion}_sqlstate_{sqlstate}_category_{category}"
    return f"postgres_{category}_sqlstate_{sqlstate}"


def _safe_psql_error_metadata(stderr: bytes, *, event_behavior: bool = False) -> dict[str, str | None]:
    """Extract only SQLSTATE/category and a fixed assertion identifier."""
    text = stderr.decode("utf-8", errors="replace")
    match = _SQLSTATE_RE.search(text)
    if not match:
        return {"sqlstate": None, "safe_error_category": "unclassified_sql_error", "assertion_id": None}
    sqlstate, primary = match.groups()
    category = _SQLSTATE_LABELS.get(sqlstate, _SQLSTATE_CLASS_LABELS.get(sqlstate[:2], "other_sql_error"))
    assertion_id = None
    if event_behavior:
        expected = (
            "no eligible test profile", "event1 queue count mismatch", "queue idempotency failed",
            "queue escaped event1", "event2 queue failed", "stale Fresh Pick event queued",
            "stale Fresh Pick event appeared in due list", "event1 claim count mismatch", "claim escaped event1",
            "claim altered another event", "stale event claimed", "stale event not suppressed",
            "null queue unexpectedly accepted", "null claim unexpectedly accepted",
        )
        if primary in expected:
            assertion_id = "event_behavior_assertion_" + primary.replace(" ", "_")
    return {"sqlstate": sqlstate, "safe_error_category": category, "assertion_id": assertion_id}


def docker_psql(docker, container, sql, *, single_transaction=False, expect_failure=False, user="postgres", label="assertion"):
    payload = sql.encode() if isinstance(sql, str) else sql
    args = ["exec", "-i", container, "psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"]
    if single_transaction:
        args.append("--single-transaction")
    args += ["-h", "/var/run/postgresql", "-U", user, "-d", "postgres"]
    try:
        result = subprocess.run([docker, *args], input=payload, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                env=restore._docker_env(), timeout=180, check=False)
    except (OSError, subprocess.TimeoutExpired):
        raise RehearsalCheckError("isolated_psql_timeout_" + label)
    if expect_failure:
        if result.returncode == 0:
            raise RehearsalCheckError("rollback_injection_not_observed")
        if b"qualification rollback sentinel" not in result.stderr:
            raise RehearsalCheckError("migration_failed_before_rollback_sentinel_" + label, result.returncode)
    elif result.returncode != 0:
        metadata = _safe_psql_error_metadata(result.stderr, event_behavior=label == "event_behavior_fixture")
        safe_diagnostic = _safe_psql_diagnostic(result.stderr, event_behavior=label == "event_behavior_fixture")
        code = metadata["assertion_id"] or "isolated_sql_failed_" + label
        raise RehearsalCheckError(code, result.returncode, safe_diagnostic,
                                  metadata["sqlstate"], metadata["safe_error_category"])
    return result.stdout.decode("utf-8", errors="strict").strip()


def schema_dump_digest(docker, container):
    args = ["exec", container, "pg_dump", "--schema-only", "--no-password",
            "--host=/var/run/postgresql", "--username=postgres", "--dbname=postgres"]
    try:
        result = subprocess.run([docker, *args], stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                env=restore._docker_env(), timeout=300, check=False)
    except (OSError, subprocess.TimeoutExpired):
        raise RuntimeError("schema_dump_timeout: Local schema fingerprint exceeded its bound")
    if result.returncode:
        raise RuntimeError("schema_dump_failed: Local schema fingerprint failed")
    # PostgreSQL 17 adds a fresh psql `\\restrict` token to every dump. Strip
    # only those generated guard directives before hashing the schema text.
    normalized = b"\n".join(
        line for line in result.stdout.splitlines()
        if not line.startswith((b"\\restrict ", b"\\unrestrict "))
    )
    return hashlib.sha256(normalized).hexdigest()


def snapshots(docker, container, *, pre_migration=False):
    raw = docker_psql(docker, container, DATA_SNAPSHOT_SQL, label="data_snapshot")
    data = json.loads(raw)
    struct = docker_psql(docker, container, STRUCTURE_SQL, label="structure_snapshot")
    cron = json.loads(docker_psql(docker, container, CRON_SQL, label="cron_snapshot"))
    pref = json.loads(docker_psql(docker, container, PREF_PRE_SQL if pre_migration else PREF_SQL,
                                  label="preference_snapshot"))
    flags = json.loads(docker_psql(docker, container, FLAG_SQL, label="feature_flag_snapshot"))
    return data, struct, cron, pref, flags


_SAFE_FAILURE_CODE = re.compile(r"^[a-z][a-z0-9_]{0,95}$")


def _safe_failure_code(exc: BaseException) -> str:
    code = getattr(exc, "code", None)
    if not isinstance(code, str):
        candidate = str(exc).split(":", 1)[0].strip()
        code = candidate if _SAFE_FAILURE_CODE.fullmatch(candidate) else "unclassified_" + type(exc).__name__.lower()
    return code if _SAFE_FAILURE_CODE.fullmatch(code) else "unclassified_failure"


def _progress(report, stage: str) -> None:
    report.data["post_migration_progress"] = {"status": "RUNNING", "stage": stage}
    report.flush()


def run_migration_hook(stage: str, container: str, report, coordinator_report, docker: str) -> None:
    if stage != "database_validated":
        return
    _progress(report, "starting_post_restore_migration_checks")
    try:
        apply_and_check(docker, container, report, coordinator_report)
    except Exception as exc:
        progress = report.data.get("post_migration_progress", {})
        report.data["post_migration_failure"] = {
            "phase": stage,
            "stage": progress.get("stage", "unclassified"),
            "check_code": _safe_failure_code(exc),
            "exception_type": type(exc).__name__,
            "subprocess_exit_status": getattr(exc, "subprocess_exit_status", None),
        }
        sqlstate = getattr(exc, "sqlstate", None)
        category = getattr(exc, "safe_error_category", None)
        if isinstance(sqlstate, str) and re.fullmatch(r"[0-9A-Z]{5}", sqlstate):
            report.data["post_migration_failure"]["sqlstate"] = sqlstate
        if isinstance(category, str) and re.fullmatch(r"[a-z][a-z0-9_]{0,63}", category):
            report.data["post_migration_failure"]["safe_error_category"] = category
        safe_diagnostic = getattr(exc, "safe_diagnostic", None)
        if isinstance(safe_diagnostic, str):
            report.data["post_migration_failure"]["safe_diagnostic"] = safe_diagnostic
        report.flush()
        raise restore.RestoreError(
            "notification_migration_hook_failed",
            "Post-restore notification migration validation failed",
        ) from None


def apply_and_check(docker, container, report, coordinator_report):
    state = restore._docker(docker, ["inspect", "--format", "{{.State.Running}}|{{.HostConfig.NetworkMode}}|{{.Config.Image}}|{{.Image}}", container])[0].decode().strip()
    expected_state = f"true|none|{restore.PINNED_IMAGE}|{restore.PINNED_IMAGE_ID}"
    if state != expected_state:
        raise RuntimeError("container_isolation_mismatch: Wrong restore container or network mode")

    baseline = docker_psql(docker, container, BASELINE_SQL, label="database_identity_and_ledger").splitlines()
    identity = baseline[0].split("|") if baseline else []
    if len(baseline) != 2 or len(identity) != 4 or identity[0] != "170006" or identity[1] != "postgres" or not identity[2].isdigit() or identity[3] != "postgres":
        raise RuntimeError("database_identity_mismatch: Restored database identity is not the captured baseline")
    if baseline[1].split("|") != ["191", "191", "20261106104602", "0"]:
        raise RuntimeError("migration_ledger_baseline_mismatch: Captured migration ledger differs")
    report.data["checks"]["actual_backup_baseline"] = {
        "identity": {"server_version_num": identity[0], "database": "postgres", "migration_execution_role": identity[1], "role_oid": identity[2], "database_owner": identity[3]},
        "ledger": {"rows": 191, "distinct": 191, "latest": "20261106104602", "candidate_versions": 0},
        "status": "PASS",
    }
    report.flush()

    before_data, before_struct, before_cron, before_pref, before_flags = snapshots(docker, container, pre_migration=True)
    active_push_jobs = [x["name"] for x in before_cron if x.get("active") and "push" in x.get("name", "").lower()]
    if active_push_jobs:
        raise RuntimeError("push_schedule_already_active: Captured database has an active Push-related cron job")
    before_schema_dump = schema_dump_digest(docker, container)
    report.data["checks"]["captured_preferences_before"] = before_pref
    report.data["checks"]["captured_relevant_boolean_flags_before"] = before_flags
    report.data["checks"]["cron_job_names_and_active_states_before"] = before_cron
    report.data["checks"]["baseline_fingerprints"] = {
        "tables": len(before_data),
        "table_data_sha256": hashlib.sha256(json.dumps(before_data, sort_keys=True).encode()).hexdigest(),
        "unrelated_security_sha256": hashlib.sha256(before_struct.encode()).hexdigest(),
    }
    report.flush()

    _progress(report, "combined_five_migration_rollback_check")
    combined = b"\n".join((MIGRATIONS_DIR / filename).read_bytes() for _, filename, _ in MIGRATIONS)
    combined += b"\nDO $pf_rollback_sentinel$ BEGIN RAISE EXCEPTION 'qualification rollback sentinel'; END $pf_rollback_sentinel$;\n"
    docker_psql(docker, container, combined, single_transaction=True, expect_failure=True, label="combined_five_migration_rollback")
    rb_data, rb_struct, _, _, _ = snapshots(docker, container, pre_migration=True)
    if before_data != rb_data:
        raise RuntimeError("transaction_rollback_data_failed: Injected five-migration failure left table data changes")
    if before_struct != rb_struct:
        raise RuntimeError("transaction_rollback_catalog_failed: Injected five-migration failure left catalog changes")
    if before_schema_dump != schema_dump_digest(docker, container):
        raise RuntimeError("transaction_rollback_schema_dump_failed: Injected five-migration failure changed schema dump")
    report.data["checks"]["combined_five_migration_failure_rollback"] = "PASS"
    report.flush()

    for version, filename, expected in MIGRATIONS:
        path = MIGRATIONS_DIR / filename
        digest, size = sha256(path)
        if digest != expected:
            raise RuntimeError("migration_hash_mismatch: A candidate migration hash changed")
        _progress(report, "transaction_rollback_check_" + version)
        rollback_sql = path.read_bytes() + b"\nDO $pf_rollback_sentinel$ BEGIN RAISE EXCEPTION 'qualification rollback sentinel'; END $pf_rollback_sentinel$;\n"
        before_file_hash = schema_dump_digest(docker, container)
        docker_psql(docker, container, rollback_sql, single_transaction=True, expect_failure=True, label="rollback_migration_" + version)
        if schema_dump_digest(docker, container) != before_file_hash:
            raise RuntimeError("single_migration_rollback_failed: Failed candidate left schema changes")
        _progress(report, "apply_migration_" + version)
        docker_psql(docker, container, b"SET lock_timeout='10s';\nSET statement_timeout='120s';\n" + path.read_bytes(),
                    single_transaction=True, label="apply_migration_" + version)
        report.data["migration_stages"].append({
            "version": version, "filename": filename, "sha256": digest, "bytes": size,
            "status": "PASS", "transaction": "one SQL file per atomic transaction",
            "injected_failure_rollback": "PASS",
        })
        report.flush()

    _progress(report, "capture_post_migration_snapshots")
    after_data, after_struct, after_cron, after_pref, after_flags = snapshots(docker, container)
    _progress(report, "compare_existing_business_data")
    if before_data != after_data:
        raise RuntimeError("existing_data_changed: Candidate migrations changed pre-existing table rows")
    _progress(report, "compare_unrelated_schema_and_security")
    if before_struct != after_struct:
        labels = ("relations_acl_rls", "functions_acl_security", "policies", "triggers", "constraints", "role_memberships")
        left, right = before_struct.split("|"), after_struct.split("|")
        changed = [labels[i // 2] for i in range(0, min(len(left), len(right)), 2)
                   if left[i:i + 2] != right[i:i + 2]]
        raise RuntimeError("unrelated_schema_or_security_changed_" + "_".join(changed or ["fingerprint_shape"]))
    _progress(report, "compare_scheduler_state")
    if before_cron != after_cron:
        raise RuntimeError("cron_state_changed: Candidate migrations changed cron job names or active states")
    _progress(report, "validate_preference_integrity_and_privileges")
    if before_pref.get("duplicate_staff_category_groups") != 0 or before_pref.get("orphan_staff_rows") != 0:
        raise RuntimeError("preference_baseline_invalid: Existing preferences include duplicates or orphans")
    if after_pref.get("duplicate_staff_category_groups") != 0 or after_pref.get("orphan_staff_rows") != 0:
        raise RuntimeError("preference_postflight_invalid: Preference duplicates or orphans found")
    def pref_privileges_without_truncate(value):
        return [row for row in (value.get("crud_privileges") or []) if row.get("privilege") != "TRUNCATE"]
    if pref_privileges_without_truncate(before_pref) != pref_privileges_without_truncate(after_pref):
        raise RuntimeError("preference_crud_privileges_changed: Existing Web/Email preference CRUD grants changed")
    if any(before_pref.get(key) != after_pref.get(key) for key in ("owner", "rls", "force_rls")):
        raise RuntimeError("preference_security_changed: Preference owner or RLS state changed")
    if after_pref.get("client_truncate_anon") or after_pref.get("client_truncate_authenticated"):
        raise RuntimeError("client_truncate_not_revoked: Client TRUNCATE remains")
    if after_pref.get("crud_privileges") is None:
        raise RuntimeError("preference_acl_inventory_missing: Preference ACL inventory is absent")
    truncate_before = {row["role"]: row["allowed"] for row in before_pref["crud_privileges"] if row["privilege"] == "TRUNCATE"}
    truncate_after = {row["role"]: row["allowed"] for row in after_pref["crud_privileges"] if row["privilege"] == "TRUNCATE"}
    if truncate_after.get("anon") is not False or truncate_after.get("authenticated") is not False or truncate_after.get("service_role") != truncate_before.get("service_role"):
        raise RuntimeError("preference_truncate_acl_unexpected: Preference TRUNCATE ACL differs from reviewed migration")
    if after_pref.get("email_dispatch_sweep_active") is not False:
        raise RuntimeError("email_dispatch_not_disabled: Existing Email dispatch job is not confirmed inactive")
    _progress(report, "validate_notification_and_fresh_pick_flags")
    before_flag_map = {(x["schema"], x["table"], x["column"]): x for x in before_flags}
    after_flag_map = {(x["schema"], x["table"], x["column"]): x for x in after_flags}
    for key, old_value in before_flag_map.items():
        if after_flag_map.get(key) != old_value:
            raise RuntimeError("notification_config_changed: Existing notification/schedule boolean states changed")
    for key, new_value in after_flag_map.items():
        if key not in before_flag_map and not (key[0] == "public" and key[1] == "staff_notification_preferences" and key[2] in {"sound_enabled", "push_enabled"}):
            raise RuntimeError("unexpected_boolean_column: Migration added an unreviewed configuration flag")
        if key[0] == "public" and key[1] == "staff_notification_preferences" and key[2] in {"sound_enabled", "push_enabled"}:
            if new_value["true"] != 0 or new_value["false"] != new_value["rows"]:
                raise RuntimeError("notification_default_not_off: New preference flags must all remain OFF")
        if "fresh_pick" in (key[1] + " " + key[2]).lower() and key[2].lower() in {
            "push_enabled", "fresh_pick_push_enabled", "fresh_pick_schedule_enabled", "schedule_enabled"
        } and new_value["true"]:
            raise RuntimeError("fresh_pick_flag_enabled: Captured Fresh Pick feature flag is enabled")
        if key[2].lower() == "dispatch_enabled" and new_value["true"]:
            raise RuntimeError("persistent_dispatch_enabled: Captured persistent notification dispatch flag is enabled")
    for category, state in after_pref.get("categories", {}).items():
        if state.get("sound_enabled") != 0 or state.get("push_enabled") != 0 or state.get("push_enabled_at_nonnull") != 0:
            raise RuntimeError("notification_default_not_off: Captured Sound/Push preference became enabled")
    _progress(report, "validate_push_security_metadata")
    sec = json.loads(docker_psql(docker, container, SECURITY_SQL, label="push_security_snapshot"))
    tables = sec.get("push_tables") or []
    if len(tables) != 2 or {x.get("name") for x in tables} != {
        "staff_notification_push_subscriptions", "staff_notification_push_deliveries"
    }:
        raise RuntimeError("push_tables_missing: Expected Push table inventory differs")
    for table in tables:
        if table.get("owner") != "postgres":
            raise RuntimeError("push_table_owner_mismatch: New Push table owner differs from Production migration role")
        if not table["rls"]:
            raise RuntimeError("push_rls_missing: Push table lacks row-level security")
        for key, value in table.items():
            if key.startswith(("anon_", "authenticated_")) and key.rsplit("_", 1)[-1] in {"select", "insert", "update", "delete"} and value:
                raise RuntimeError("push_client_acl_open: Client role has direct Push table access")
            if key.startswith("service_role_") and not value:
                raise RuntimeError("push_service_role_acl_missing: service_role table access is missing")
    functions = sec.get("push_functions") or []
    if len(functions) != 6:
        raise RuntimeError("push_rpc_inventory_mismatch: Expected server functions are missing")
    for fn in functions:
        if fn.get("owner") != "postgres":
            raise RuntimeError("push_function_owner_mismatch: New Push function owner differs from Production migration role")
        if not fn["security_definer"] or not fn["search_path_public"] or fn["anon_execute"] or fn["authenticated_execute"] or not fn["service_role_execute"]:
            raise RuntimeError("push_rpc_acl_or_security_mismatch: Push RPC security differs")
    triggers = sec.get("push_triggers") or []
    trigger_map = {x.get("name"): (x.get("table"), x.get("function"), x.get("enabled")) for x in triggers}
    if trigger_map != {
        "staff_notification_preferences_push_enabled_at": ("staff_notification_preferences", "staff_notification_set_push_enabled_at", "O"),
        "staff_notification_revoke_inactive_push": ("staff_profiles", "staff_notification_revoke_inactive_push", "O"),
    }:
        raise RuntimeError("push_trigger_inventory_mismatch: Expected enabled preference and inactive-staff Push triggers are missing")
    trigger_functions = sec.get("push_trigger_functions") or []
    if {x.get("name") for x in trigger_functions} != {
        "staff_notification_set_push_enabled_at", "staff_notification_revoke_inactive_push"
    }:
        raise RuntimeError("push_trigger_function_inventory_mismatch: Push trigger functions are missing")
    for fn in trigger_functions:
        if fn.get("owner") != "postgres" or fn.get("anon_execute") or fn.get("authenticated_execute") or fn.get("service_role_execute"):
            raise RuntimeError("push_trigger_function_acl_mismatch: Trigger function owner or direct execute grants differ")
    if sec.get("sound_default") not in ("false", "false::boolean") or sec.get("push_default") not in ("false", "false::boolean"):
        raise RuntimeError("sound_or_push_default_on: Preference column default is not OFF")
    _progress(report, "validate_event_scoped_queue_behavior")
    behavior_ids = [str(uuid.uuid4()) for _ in range(5)]
    behavior_sql = BEHAVIOR_SQL
    for token, value in zip(("__E1__", "__E2__", "__ES__", "__S1__", "__S2__"), behavior_ids):
        behavior_sql = behavior_sql.replace(token, value)
    if "EVENT_SCOPE_QUEUE_CLAIM_IDEMPOTENCY_STALE_HOLD_NULL_ID=PASS" not in docker_psql(docker, container, behavior_sql, label="event_behavior_fixture"):
        raise RuntimeError("event_scope_behavior_failed: Transactional behavior assertions did not pass")
    _progress(report, "validate_behavior_fixture_rollback")
    residue = docker_psql(docker, container, "SELECT (SELECT count(*) FROM public.staff_notification_push_subscriptions)||'|'||(SELECT count(*) FROM public.staff_notification_push_deliveries);", label="event_fixture_rollback_check")
    if residue != "0|0":
        raise RuntimeError("synthetic_notification_residue: Behavior fixture did not fully roll back")
    _progress(report, "validate_migration_ledger_unchanged")
    ledger_after = docker_psql(docker, container, BASELINE_SQL, label="post_migration_ledger").splitlines()
    if len(ledger_after) != 2 or ledger_after[1].split("|") != ["191", "191", "20261106104602", "0"]:
        raise RuntimeError("migration_history_changed: Direct rehearsal altered migration history")
    report.data["checks"].update({
        "pre_existing_table_data_unchanged": "PASS",
        "non_notification_functions_relations_policies_triggers_constraints_and_role_memberships_unchanged": "PASS",
        "cron_job_state_unchanged": "PASS",
        "no_active_push_cron_jobs": "PASS",
        "email_dispatch_sweep": "DISABLED",
        "fresh_pick_push_and_sound": "OFF",
        "push_security": {"tables": tables, "functions": functions, "status": "PASS"},
        "event_scoped_queue_claim_idempotency_stale_hold_and_null_rejection": "PASS",
        "business_rows_and_checkout_functions": "unchanged; full captured table and non-notification function fingerprints match",
        "migration_history_after": {"rows": 191, "distinct": 191, "latest": "20261106104602", "candidate_rows": 0,
                                    "note": "Direct SQL rehearsal intentionally does not write migration history."},
        "actual_captured_database_schema_migration_rehearsal": "PASS",
    })
    report.data["post_migration_progress"] = {"status": "PASS", "stage": "all_post_migration_assertions"}
    report.flush()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--preflight-only", action="store_true", help="verify local source, archive metadata, image, and disk without prompting or restoring")
    args = parser.parse_args()
    if args.preflight_only:
        try:
            print(json.dumps(preflight_only(), sort_keys=True, indent=2))
            return 0
        except BaseException as exc:
            print("PREFLIGHT=FAIL code=" + str(exc).split(":", 1)[0], file=sys.stderr)
            return 2
    EVIDENCE_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(EVIDENCE_DIR, 0o700)
    stamp = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    report_path = EVIDENCE_DIR / f"actual-backup-notification-migrations-{stamp}-{os.getpid()}-{uuid.uuid4().hex[:8]}.json"
    report = Report(report_path)
    coordinator_report = None
    try:
        restore._check_private_directory(BACKUP)
        for rel, expected in ARCHIVES.items():
            digest, size = sha256(BACKUP / rel)
            if digest != expected:
                raise RuntimeError("archive_hash_mismatch: Pinned archive did not match")
            report.data["archive_hashes"][rel] = {"sha256": digest, "bytes": size}
        report.data["source"] = {
            "repository_head": subprocess.run(["git", "-C", str(REPO), "rev-parse", "HEAD"],
                                               capture_output=True, text=True, check=True).stdout.strip(),
            "coordinator_sha256": sha256(RESTORE_DIR / "restore_backup_isolated.py")[0],
            "role_replay_sha256": sha256(RESTORE_DIR / "restore_roles_native.py")[0],
            "reconstructed_fifth": "20261116120000 new provenance; original 20261114120000 remains unavailable",
        }
        report.data["checks"]["local_preflight"] = preflight_only()
        for version, filename, expected in MIGRATIONS:
            digest, size = sha256(MIGRATIONS_DIR / filename)
            if digest != expected:
                raise RuntimeError("migration_hash_mismatch: Pinned migration file changed")
            report.data.setdefault("candidate_migrations", []).append(
                {"version": version, "filename": filename, "sha256": digest, "bytes": size})
        report.flush()

        coordinator_report = restore._report_path(BACKUP)
        def hook(stage, container):
            run_migration_hook(stage, container, report, coordinator_report, docker)
        docker = shutil.which("docker")
        if not docker:
            raise RuntimeError("docker_unavailable: Docker executable not found")
        result = restore.run_restore(BACKUP, coordinator_report, phase_hook=hook)
        if result.get("status") != "PASS" or not report.data["checks"].get("actual_captured_database_schema_migration_rehearsal"):
            raise RuntimeError("coordinator_restore_failed: Actual archive restore or migration hook did not pass")
        # Prove archive bytes stayed unchanged through the rehearsal.
        for rel, expected in ARCHIVES.items():
            if sha256(BACKUP / rel)[0] != expected:
                raise RuntimeError("archive_changed: An encrypted source archive changed")
        report.data["archive_preservation"] = "PASS"
        report.data["coordinator_report"] = str(coordinator_report)
        report.data["status"] = "PASS"
        report.data["limitations"] = [
            "Restore ran with pinned PostgreSQL 17.6.1.167; Production was 17.6.1.166.",
            "Direct SQL rehearsal leaves the captured 191-row migration ledger unchanged; the deployment migration runner must record versions separately.",
            "The original qualified 20261114120000 source remains unavailable. The fifth candidate has new version 20261116120000 and new provenance.",
            "The deployed Production application has no Push RPC callers, so it can coexist with the additive/OFF schema. The surviving replacement app has no-argument scheduleStaffNotificationDispatch() calls; its Push dispatcher passes null to the fail-closed RPC and safely queues nothing. Correct event-ID propagation is required before that app can provide Push.",
            "No live scheduler, application service, provider, Production endpoint, or notification dispatch was executed.",
        ]
        report.data["finished_at_utc"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        report.flush()
        print("ACTUAL_BACKUP_NOTIFICATION_MIGRATION_REHEARSAL=PASS")
        print("PRODUCTION_CONNECTION=NONE")
        print(f"REPORT={report_path}")
        print(f"RESTORE_REPORT={coordinator_report}")
        return 0
    except BaseException as exc:
        report.data["status"] = "FAIL"
        report.data["error_code"] = _safe_failure_code(exc)
        report.data["safe_summary"] = "The sanitized stage report is authoritative; SQL stderr and row data are not stored."
        report.data["coordinator_report"] = str(coordinator_report) if coordinator_report else None
        report.data["finished_at_utc"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        report.flush()
        print(f"ACTUAL_BACKUP_NOTIFICATION_MIGRATION_REHEARSAL=FAIL code={report.data['error_code']}", file=sys.stderr)
        print(f"REPORT={report_path}", file=sys.stderr)
        if coordinator_report:
            print(f"RESTORE_REPORT={coordinator_report}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
