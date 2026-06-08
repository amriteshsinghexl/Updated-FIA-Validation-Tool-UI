import { CodeEditorPanel } from "@/components/CodeEditorPanel";

export default function CodeEditorView() {
  return (
    <CodeEditorPanel
      open={true}
      onClose={() => window.history.back()}
      standalone={true}
    />
  );
}
