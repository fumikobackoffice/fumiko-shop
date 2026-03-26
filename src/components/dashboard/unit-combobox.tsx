
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
import { useState, useTransition, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { Unit } from "@/lib/types";
import { collection, query, orderBy, getDocs, doc, where, deleteDoc, limit, writeBatch } from "firebase/firestore";
import { unitNames } from "@/lib/units";

export function UnitCombobox({ field, disabled }: { field: any, disabled?: boolean }) {
  const { user } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [unitToDelete, setUnitToDelete] = useState<Unit | null>(null);

  const unitsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'units'), orderBy('name'));
  }, [firestore]);

  const { data: units, isLoading } = useCollection<Unit>(unitsQuery);

  useEffect(() => {
    const seedUnits = async () => {
      if (firestore && user && ['super_admin', 'admin'].includes(user.role) && !isLoading && units && units.length === 0) {
        const checkSnap = await getDocs(query(collection(firestore, 'units'), limit(1)));
        if (checkSnap.empty) {
            console.log("Seeding initial product units...");
            const batch = writeBatch(firestore);
            unitNames.forEach(unit => {
                const docRef = doc(collection(firestore, "units"));
                batch.set(docRef, { name: unit.name });
            });
            await batch.commit();
            toast({ title: "หน่วยนับเริ่มต้นถูกสร้างแล้ว"});
        }
      }
    };
    seedUnits();
  }, [firestore, user, units, isLoading, toast]);

  const handleDelete = () => {
    if (!unitToDelete || !firestore) return;
    
    startTransition(async () => {
        try {
            const productsRef = collection(firestore, 'productGroups');
            const q = query(productsRef, where("unit", "==", unitToDelete.name), limit(1));
            const snapshot = await getDocs(q);

            if (!snapshot.empty) {
                toast({ variant: "destructive", title: "ลบหน่วยนับไม่สำเร็จ", description: `ไม่สามารถลบได้ เนื่องจากมีการใช้งานโดยสินค้าอย่างน้อย 1 รายการ` });
                setDialogOpen(false);
                return;
            }

            await deleteDoc(doc(firestore, 'units', unitToDelete.id));

            toast({ title: "ลบหน่วยนับสำเร็จ", description: `หน่วยนับ "${unitToDelete.name}" ถูกลบแล้ว`});
            if (field.value === unitToDelete.name) {
                field.onChange("");
            }
        } catch (e: any) {
            console.error("Error deleting unit:", e);
            toast({ variant: "destructive", title: "เกิดข้อผิดพลาด", description: e.message || "ไม่สามารถลบหน่วยนับได้" });
        } finally {
            setUnitToDelete(null);
            setDialogOpen(false);
        }
    });
  };

  const currentUnits = units || [];
  const filteredUnits = inputValue
    ? currentUnits.filter(unit =>
        unit.name.toLowerCase().includes(inputValue.toLowerCase())
      )
    : currentUnits;
  
  const showCreateOption = user && ['super_admin', 'admin'].includes(user.role) && inputValue.trim() !== '' && !currentUnits.some(unit => unit.name.toLowerCase() === inputValue.trim().toLowerCase());

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
            className="w-full justify-between font-normal"
            disabled={disabled}
          >
            {field.value || "เลือกหรือสร้างหน่วยนับ..."}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
          <Command shouldFilter={false}>
            <CommandInput 
              placeholder="ค้นหาหรือสร้างหน่วยนับ..." 
              value={inputValue}
              onValueChange={setInputValue}
            />
            <CommandList>
              {isLoading && <div className="p-4 text-sm text-center text-muted-foreground">กำลังโหลด...</div>}
              {!isLoading && filteredUnits.length === 0 && !showCreateOption && (
                <CommandEmpty>ไม่พบหน่วยนับ</CommandEmpty>
              )}
              <CommandGroup>
                {filteredUnits.map((unit) => (
                  <CommandItem
                    key={unit.id}
                    value={unit.name}
                    className="group flex justify-between items-center pr-2"
                    onSelect={() => {
                      field.onChange(field.value === unit.name ? "" : unit.name);
                      setOpen(false);
                      setInputValue("");
                    }}
                  >
                    <div className="flex items-center">
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          field.value === unit.name ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <span className="truncate">{unit.name}</span>
                    </div>
                    {user && ['super_admin', 'admin'].includes(user.role) && (
                      <div
                        className="p-1 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity rounded-md"
                        onClick={(e) => {
                          e.stopPropagation();
                          setUnitToDelete(unit);
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
                      onSelect={() => {
                        const newUnitName = inputValue.trim();
                        field.onChange(newUnitName);
                        setOpen(false);
                        setInputValue("");
                      }}
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
              คุณแน่ใจหรือไม่ว่าต้องการลบหน่วยนับ "{unitToDelete?.name}"? การกระทำนี้ไม่สามารถย้อนกลับได้
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
