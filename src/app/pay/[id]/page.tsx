import { Suspense } from "react";
import { Loading } from "@/components/ui";
import PayClient from "./PayClient";

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <PayClient />
    </Suspense>
  );
}
