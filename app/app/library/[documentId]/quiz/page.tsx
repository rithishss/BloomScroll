import { QuizScreen } from "@/components/screens/quiz-screen";

export default async function AppQuizPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;
  return <QuizScreen basePath="/app" documentId={documentId} />;
}
