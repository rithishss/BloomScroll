import { DocumentScreen } from "@/components/screens/document-screen";

export default async function DemoDocumentPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;
  return <DocumentScreen basePath="/demo" documentId={documentId} />;
}
