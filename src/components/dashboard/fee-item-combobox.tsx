
'use client';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button, buttonVariants } from "@/components/ui/button";
import { Check, ChevronsUpDown, Trash2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useTransition } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { FeeItemTemplate } from "@/lib/types";
import { collection, query, orderBy, getDocs, writeBatch, doc, where, deleteDoc, limit } from "firebase/firestore";

interface FeeItemComboboxProps {
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
}

export function FeeItemCombobox({ value, onChange, disabled }: FeeItemComboboxProps) {
  const { user } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<FeeItemTemplate | null>(null);

  const templatesQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'feeItemTemplates'), orderBy('name'));
  }, [firestore]);

  const { data: templates, isLoading } = useCollection<FeeItemTemplate>(templatesQuery);

  const handleDelete = () => {
    if (!itemToDelete || !firestore) return;
    
    startTransition(async () => {
        try {
            await deleteDoc(doc(firestore, 'feeItemTemplates', itemToDelete.id));
            toast({ title: "ลบชื่อรายการสำเร็จ", description: `"${itemToDelete.name}" ถูกลบออกจากรายการแนะนำแล้ว`});
            if (value === itemToDelete.name) {
                onChange("");
            }
        } catch (e: any) {
            console.error("Error deleting fee item template:", e);
            toast({ variant: "destructive", title: "เกิดข้อผิดพลาด", description: e.message || "ไม่สามารถลบข้อมูลได้" });
        } finally {
            setItemToDelete(null);
            setDialogOpen(false);
        }
    });
  };

  const currentTemplates = templates || [];
  const filteredTemplates = inputValue
    ? currentTemplates.filter(t =>
        t.name.toLowerCase().includes(inputValue.toLowerCase())
      )
    : currentTemplates;
  
  const showCreateOption = user && ['super_admin', 'admin'].includes(user.role) && inputValue.trim() !== '' && !currentTemplates.some(t => t.name.toLowerCase() === inputValue.trim().toLowerCase());

  const handleSelect = (name: string) => {
    const newName = value === name ? "" : name;
    onChange(newName);

    // Auto-save new template if admin
    if(firestore && user && ['super_admin', 'admin'].includes(user.role)) {
        const exists = currentTemplates.some(t => t.name.toLowerCase() === newName.trim().toLowerCase());
        if (!exists && newName.trim() !== '') {
            const batch = writeBatch(firestore);
            const docRef = doc(collection(firestore, 'feeItemTemplates'));
            batch.set(docRef, { name: newName.trim() });
            batch.commit().catch(e => console.error("Auto-save template failed", e));
        }
    }
    
    setOpen(false);
    setInputValue("");
  }

  return (
    <>
      <Popover open={open} onOpenChange={(isOpen) => {
        if (disabled) return;
        setOpen(isOpen);
        if (!isOpen) setInputValue(""); 
      }}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal h-11"
            disabled={disabled}
          >
            {value || "เลือกหรือพิมพ์ชื่อรายการ..."}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput 
              placeholder="ค้นหาหรือพิมพ์ชื่อรายการใหม่..." 
              value={inputValue}
              onValueChange={setInputValue}
            />
            <CommandList>
              {isLoading && <div className="p-4 text-sm text-center text-muted-foreground">กำลังโหลด...</div>}
              {!isLoading && filteredTemplates.length === 0 && !showCreateOption && (
                <CommandEmpty>พิมพ์เพื่อสร้างรายการใหม่</CommandEmpty>
              )}
              <CommandGroup>
                {filteredTemplates.map((template) => (
                  <CommandItem
                    key={template.id}
                    value={template.name}
                    className="group flex justify-between items-center pr-2"
                    onSelect={() => handleSelect(template.name)}
                  >
                    <div className="flex items-center">
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === template.name ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <span className="truncate">{template.name}</span>
                    </div>
                    {user && ['super_admin', 'admin'].includes(user.role) && (
                      <div
                        className="p-1 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity rounded-md"
                        onClick={(e) => {
                          e.stopPropagation();
                          setItemToDelete(template);
                          setDialogOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </div>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
              {showCreateOption && (
                  <CommandGroup>
                    <CommandItem
                      onSelect={() => handleSelect(inputValue.trim())}
                    >
                      <Check className="mr-2 h-4 w-4 opacity-0" />
                      สร้างและเลือก "{inputValue.trim()}"
                    </CommandItem>
                  </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันการลบ?</AlertDialogTitle>
            <AlertDialogDescription>
              คุณแน่ใจหรือไม่ว่าต้องการลบชื่อรายการ "{itemToDelete?.name}" ออกจากรายการแนะนำ? (ไม่มีผลต่อสาขาที่ใช้ชื่อนี้ไปแล้ว)
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isPending} className={cn(buttonVariants({ variant: "destructive" }))}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              ลบ
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
