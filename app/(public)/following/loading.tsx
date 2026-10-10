import { ListSkeleton } from "@/components/states";

/** Shown while the followed-projects feed loads the registry and update log. */
export default function Loading() {
  return <ListSkeleton />;
}
