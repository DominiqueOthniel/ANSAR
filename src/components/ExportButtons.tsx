import { Button } from '@/components/ui/button';
import { FileDown, FileText } from 'lucide-react';

type ExportButtonsProps = {
  onExcel: () => void;
  onPdf: () => void;
  size?: 'default' | 'sm';
};

/** Boutons Excel + PDF (impression) alignés sur les autres écrans. */
export function ExportButtons({ onExcel, onPdf, size = 'default' }: ExportButtonsProps) {
  const btnClass =
    size === 'sm'
      ? 'shadow-sm'
      : 'shadow-md hover:shadow-lg transition-all duration-300';
  return (
    <>
      <Button variant="outline" size={size} onClick={onExcel} className={btnClass}>
        <FileDown className="mr-2 h-4 w-4" />
        Excel
      </Button>
      <Button variant="outline" size={size} onClick={onPdf} className={btnClass}>
        <FileText className="mr-2 h-4 w-4" />
        PDF
      </Button>
    </>
  );
}
