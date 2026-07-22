import { Suspense } from "react";
import { AskScreen } from "@/components/screens/ask-screen";

export default function AppAskPage() {
  return (
    <Suspense>
      <AskScreen />
    </Suspense>
  );
}
