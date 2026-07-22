import { DocumentScreen } from "@/components/screens/document-screen";

export default async function AppDocumentPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;
  return <DocumentScreen basePath="/app" documentId={documentId} />;
}
