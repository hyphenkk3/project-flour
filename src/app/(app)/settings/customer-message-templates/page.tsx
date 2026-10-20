import { redirect } from "next/navigation";
import { requireStaff } from "@/foundation/auth/session";
import { createClient } from "@/lib/supabase/server";
import { CUSTOMER_MESSAGE_TEMPLATE_DEFINITIONS } from "@/engines/customer-message-templates";
import { CustomerMessageTemplatesEditor, type EditableTemplate } from "@/components/settings/CustomerMessageTemplatesEditor";

export const dynamic = "force-dynamic";

export default async function CustomerMessageTemplatesPage() {
  const staff = await requireStaff();
  if (staff.role.code !== "owner" && staff.role.code !== "manager") {
    redirect("/settings");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_message_templates")
    .select("template_key,display_name,category,description,body,default_body,allowed_placeholders,required_placeholders,revision,updated_at")
    .order("category")
    .order("display_name");

  const migrationReady = !error && Boolean(data?.length);
  const initialTemplates: EditableTemplate[] = migrationReady
    ? data as EditableTemplate[]
    : CUSTOMER_MESSAGE_TEMPLATE_DEFINITIONS.map((row) => ({
        template_key: row.key,
        display_name: row.displayName,
        category: row.category,
        description: row.description,
        body: row.body,
        default_body: row.body,
        allowed_placeholders: [...row.allowed],
        required_placeholders: [...row.required],
        revision: 1,
        updated_at: null,
      }));

  return (
    <CustomerMessageTemplatesEditor
      initialTemplates={initialTemplates}
      migrationReady={migrationReady}
    />
  );
}
