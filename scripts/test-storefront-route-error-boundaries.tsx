/** Exercise the public page error boundaries and verify retry wiring. */
import assert from "node:assert/strict";
import { isValidElement, type ReactNode } from "react";
import HomeError from "@/app/error";
import BrowseError from "@/app/browse/error";
import CollectionError from "@/app/order/collection/[id]/error";
import CakeError from "@/app/cakes/[id]/error";

type BoundaryProps = {
  error: Error & { digest?: string };
  unstable_retry: () => void;
};
type Boundary = (props: BoundaryProps) => ReactNode;

type ElementLike = {
  type: string | ((props: Record<string, unknown>) => unknown);
  props: Record<string, unknown> & { children?: ReactNode };
};

function visit(node: ReactNode, found: ElementLike[] = []): ElementLike[] {
  if (Array.isArray(node)) {
    for (const child of node) visit(child, found);
    return found;
  }
  if (!isValidElement(node)) return found;
  const element = node as unknown as ElementLike;
  found.push(element);
  visit(element.props.children ?? null, found);
  return found;
}

function textContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textContent).join(" ");
  if (!isValidElement(node)) return "";
  return textContent((node.props as { children?: ReactNode }).children ?? null);
}

const boundaries: Array<[string, Boundary]> = [
  ["home", HomeError],
  ["browse", BrowseError],
  ["collection", CollectionError],
  ["cake", CakeError],
];

for (const [name, BoundaryComponent] of boundaries) {
  const unstable_retry = () => {};
  const boundary = BoundaryComponent({
    error: new Error("database details must not be exposed"),
    unstable_retry,
  });
  assert.ok(isValidElement(boundary), `${name} returns the shared error UI`);
  const component = boundary.type as (props: Record<string, unknown>) => ReactNode;
  const ui = component(boundary.props as Record<string, unknown>);
  const elements = visit(ui);
  const button = elements.find((element) => element.type === "button");
  const main = elements.find((element) => element.type === "main");
  assert.ok(button, `${name} has a retry button`);
  assert.equal(button.props.onClick, unstable_retry);
  assert.equal(main?.props.role, "alert");
  assert.match(textContent(ui), /temporarily unavailable/i);
  assert.match(textContent(ui), /Try again/);
  assert.doesNotMatch(textContent(ui), /database details/);
}

console.log("PASS storefront route error boundaries and retry wiring");
