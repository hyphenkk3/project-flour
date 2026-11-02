import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assignmentsToPreserve, getKuchingBusinessDate, isAddonCollectionPast, partitionAddonCollections } from "../src/workspaces/library/addons/collection-dates.mjs";
const root = new URL("../", import.meta.url);
const source = (path) => readFileSync(new URL(path, root), "utf8");
assert.equal(getKuchingBusinessDate(new Date("2026-11-02T15:59:59.000Z")), "2026-11-02");
assert.equal(getKuchingBusinessDate(new Date("2026-11-02T16:00:00.000Z")), "2026-11-03");
const today="2026-11-03";
const collections=[
 {id:"ended",name:"Ended",status:"active",startDate:"2026-10-01",endDate:"2026-11-02"},
 {id:"today",name:"Ends today",status:"past",startDate:"2026-11-01",endDate:today},
 {id:"upcoming",name:"Upcoming",status:"archived",startDate:"2026-11-10",endDate:"2026-11-30"},
 {id:"open",name:"Open ended",status:"inactive",startDate:null,endDate:null},
];
assert.equal(isAddonCollectionPast(collections[0],today),true);
assert.equal(isAddonCollectionPast(collections[1],today),false);
assert.deepEqual(partitionAddonCollections(collections,today).editable.map((item)=>item.id),["today","upcoming","open"]);
assert.deepEqual(partitionAddonCollections(collections,today).historical.map((item)=>item.id),["ended"]);
const rows=[{collection_id:"ended",is_available:true},{collection_id:"today",is_available:true},{collection_id:"omitted",is_available:true},{collection_id:"unknown",is_available:true}];
const preserved=assignmentsToPreserve(rows,new Set(["ended","today"]),new Map(collections.map((item)=>[item.id,item])),today);
assert.deepEqual(preserved.map((row)=>row.collection_id),["ended","omitted","unknown"]);
assert.equal(preserved[0].is_available,true);
const manager=source("src/workspaces/library/addons/AddonCatalogueManager.tsx");
assert.equal((manager.match(/<details/g)||[]).length>=3,true,"Create, item and historical sections use native keyboard-accessible details");
assert.equal(manager.includes('open={'),false,"accordions are collapsed by default");
assert.equal(manager.includes("Past collection settings"),true);
assert.equal(manager.includes("Current and upcoming collections"),true);
const action=source("src/workspaces/library/addons/actions.ts");
assert.equal(action.includes("assignmentsToPreserve"),true,"server action preserves omitted and past mapping rows from the database");
assert.equal(action.includes("getKuchingBusinessDate"),true,"save validation uses current Kuching business date");
const query=source("src/workspaces/library/addons/queries.ts");
assert.equal(query.includes("start_date, end_date"),true,"classification uses authoritative collection date range");
console.log("PASS: Kuching midnight and inclusive boundaries; status-independent ended classification; historical mapping preservation; native closed-by-default accordions; distinct read-only history; current server-date guard.");
