import { useEditor, EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  Heading2,
  Heading3,
  Quote,
  Undo,
  Redo,
  Link as LinkIcon,
  Unlink,
  Eraser,
  Minus,
} from "lucide-react";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
}

function Toolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;

  const setLink = () => {
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL do link", previous ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    const normalized = url.trim();
    if (!/^(https?:\/\/|mailto:|tel:)/i.test(normalized)) {
      window.alert("Use um endereço completo iniciado por https://, mailto: ou tel:.");
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: normalized, target: "_blank", rel: "noopener noreferrer" }).run();
  };

  return (
    <div className="flex flex-wrap items-center gap-1 border-b bg-muted/40 px-2 py-1.5">
      <Toggle size="sm" pressed={editor.isActive("bold")} onPressedChange={() => editor.chain().focus().toggleBold().run()} aria-label="Negrito">
        <Bold className="h-4 w-4" />
      </Toggle>
      <Toggle size="sm" pressed={editor.isActive("italic")} onPressedChange={() => editor.chain().focus().toggleItalic().run()} aria-label="Itálico">
        <Italic className="h-4 w-4" />
      </Toggle>
      <Toggle size="sm" pressed={editor.isActive("underline")} onPressedChange={() => editor.chain().focus().toggleUnderline().run()} aria-label="Sublinhado">
        <UnderlineIcon className="h-4 w-4" />
      </Toggle>
      <Toggle size="sm" pressed={editor.isActive("strike")} onPressedChange={() => editor.chain().focus().toggleStrike().run()} aria-label="Tachado">
        <Strikethrough className="h-4 w-4" />
      </Toggle>
      <div className="mx-1 h-5 w-px bg-border" />
      <Toggle size="sm" pressed={editor.isActive("heading", { level: 2 })} onPressedChange={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} aria-label="Título 2">
        <Heading2 className="h-4 w-4" />
      </Toggle>
      <Toggle size="sm" pressed={editor.isActive("heading", { level: 3 })} onPressedChange={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} aria-label="Título 3">
        <Heading3 className="h-4 w-4" />
      </Toggle>
      <Toggle size="sm" pressed={editor.isActive("blockquote")} onPressedChange={() => editor.chain().focus().toggleBlockquote().run()} aria-label="Citação">
        <Quote className="h-4 w-4" />
      </Toggle>
      <div className="mx-1 h-5 w-px bg-border" />
      <Toggle size="sm" pressed={editor.isActive("bulletList")} onPressedChange={() => editor.chain().focus().toggleBulletList().run()} aria-label="Lista">
        <List className="h-4 w-4" />
      </Toggle>
      <Toggle size="sm" pressed={editor.isActive("orderedList")} onPressedChange={() => editor.chain().focus().toggleOrderedList().run()} aria-label="Lista numerada">
        <ListOrdered className="h-4 w-4" />
      </Toggle>
      <div className="mx-1 h-5 w-px bg-border" />
      <Toggle size="sm" pressed={editor.isActive("link")} onPressedChange={setLink} aria-label="Link">
        <LinkIcon className="h-4 w-4" />
      </Toggle>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 px-2"
        onClick={() => editor.chain().focus().unsetLink().run()}
        disabled={!editor.isActive("link")}
        aria-label="Remover link"
      >
        <Unlink className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 px-2"
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        aria-label="Inserir separador"
        title="Inserir separador"
      >
        <Minus className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 px-2"
        onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
        aria-label="Limpar formatação"
        title="Limpar formatação"
      >
        <Eraser className="h-4 w-4" />
      </Button>
      <div className="mx-1 h-5 w-px bg-border" />
      <Button type="button" size="sm" variant="ghost" className="h-8 px-2" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} aria-label="Desfazer">
        <Undo className="h-4 w-4" />
      </Button>
      <Button type="button" size="sm" variant="ghost" className="h-8 px-2" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} aria-label="Refazer">
        <Redo className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function RichTextEditor({ value, onChange, placeholder, className }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: { openOnClick: false, HTMLAttributes: { class: "text-primary underline" } },
      }),
    ],
    content: value || "",
    editorProps: {
      attributes: {
        class:
          "prose prose-sm dark:prose-invert max-w-none min-h-[160px] px-3 py-2 focus:outline-none",
        "data-placeholder": placeholder ?? "",
        "aria-label": placeholder || "Editor de texto rico",
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange(html === "<p></p>" ? "" : html);
    },
  });

  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const incoming = value || "";
    if (incoming !== current && incoming !== current.replace(/<p><\/p>/g, "")) {
      editor.commands.setContent(incoming, { emitUpdate: false });
    }
  }, [value, editor]);

  return (
    <div className={`rounded-md border bg-background ${className ?? ""}`}>
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}

export default RichTextEditor;
