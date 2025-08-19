import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { prettyBytes } from "../lib/pdfFile"
import type { PdfItem } from "../lib/types"

export const SortableCard = ({ item, onRemove }: { item: PdfItem; onRemove: (id: string) => void }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className="group relative flex gap-3 rounded-2xl border p-3 shadow-sm hover:shadow-md bg-white">
      <div className="w-20 h-28 shrink-0 overflow-hidden rounded-xl bg-gray-100 flex items-center justify-center">
        {item.thumb ? <img src={item.thumb} alt="thumb" className="w-full h-full object-cover" /> : <div className="text-xs text-gray-500">No preview</div>}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="font-medium truncate" title={item.name}>
            {item.name}
          </div>
          <span className="text-xs text-gray-500">{prettyBytes(item.size)}</span>
        </div>
        <div className="text-xs text-gray-500">Drag handle to reorder</div>
        <div className="mt-2 flex gap-2">
          <button className="rounded-xl border px-2 py-1 text-sm hover:bg-gray-50" onClick={() => onRemove(item.id)} title="Remove">
            Remove
          </button>
          <div
            {...attributes}
            {...listeners}
            className="ml-auto cursor-grab active:cursor-grabbing rounded-xl border px-2 py-1 text-sm bg-gray-50"
            title="Drag to reorder"
          >
            ⠿ Drag
          </div>
        </div>
      </div>
    </div>
  )
}
