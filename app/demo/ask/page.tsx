import { Suspense } from "react";
import { AskScreen } from "@/components/screens/ask-screen";

export default function DemoAskPage() {
  return (
    <Suspense>
      <AskScreen />
    </Suspense>
  );
}
