import { QuizScreen } from "@/components/screens/quiz-screen";

export default async function DemoQuizPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;
  return <QuizScreen basePath="/demo" documentId={documentId} />;
}
