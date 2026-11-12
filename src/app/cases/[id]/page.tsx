import { Suspense } from "react";
import { Loading } from "@/components/ui";
import CaseClient from "./CaseClient";

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <CaseClient />
    </Suspense>
  );
}
