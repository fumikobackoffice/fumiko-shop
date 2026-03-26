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
import { Carrier } from "@/lib/types";
import { collection, query, orderBy, limit, getDocs, writeBatch, doc, where, deleteDoc } from "firebase/firestore";

interface CarrierComboboxProps {
    value: string;
    onChange: (value: string) => void;
}

export function CarrierCombobox({ value, onChange }: CarrierComboboxProps) {
  const { user } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [carrierToDelete, setCarrierToDelete] = useState<Carrier | null>(null);

  const carriersQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'carriers'), orderBy('name'));
  }, [firestore]);

  const { data: carriers, isLoading } = useCollection<Carrier>(carriersQuery);

  const handleDelete = () => {
    if (!carrierToDelete || !firestore) return;
    
    startTransition(async () => {
        try {
            const ordersRef = collection(firestore, 'orders');
            const q = query(ordersRef, where("carrier", "==", carrierToDelete.name), limit(1));
            const snapshot = await getDocs(q);

            if (!snapshot.empty) {
                toast({ variant: "destructive", title: "ลบไม่สำเร็จ", description: `ไม่สามารถลบได้ เนื่องจากมีการใช้งานโดยออเดอร์อย่างน้อย 1 รายการ` });
                setDialogOpen(false);
                return;
            }

            await deleteDoc(doc(firestore, 'carriers', carrierToDelete.id));

            toast({ title: "ลบบริษัทขนส่งสำเร็จ", description: `"${carrierToDelete.name}" ถูกลบแล้ว`});
            if (value === carrierToDelete.name) {
                onChange("");
            }
        } catch (e: any) {
            console.error("Error deleting carrier:", e);
            toast({ variant: "destructive", title: "เกิดข้อผิดพลาด", description: e.message || "ไม่สามารถลบบริษัทขนส่งได้" });
        } finally {
            setCarrierToDelete(null);
            setDialogOpen(false);
        }
    });
  };

  const currentCarriers = carriers || [];
  const filteredCarriers = inputValue
    ? currentCarriers.filter(carrier =>
        carrier.name.toLowerCase().includes(inputValue.toLowerCase())
      )
    : currentCarriers;
  
  const showCreateOption = user && ['super_admin', 'admin'].includes(user.role) && inputValue.trim() !== '' && !currentCarriers.some(carrier => carrier.name.toLowerCase() === inputValue.trim().toLowerCase());

  const handleSelect = (carrierName: string) => {
    const newName = value === carrierName ? "" : carrierName;
    onChange(newName);

    if(firestore && user && ['super_admin', 'admin'].includes(user.role)) {
        const exists = currentCarriers.some(c => c.name.toLowerCase() === newName.trim().toLowerCase());
        if (!exists && newName.trim() !== '') {
            const batch = writeBatch(firestore);
            const docRef = doc(collection(firestore, 'carriers'));
            batch.set(docRef, { name: newName.trim() });
            batch.commit().then(() => {
                toast({ title: 'เพิ่มบริษัทขนส่งใหม่', description: `"${newName.trim()}" ถูกเพิ่มในรายการแล้ว`});
            }).catch(e => {
                 toast({ variant: 'destructive', title: 'เกิดข้อผิดพลาด', description: `ไม่สามารถเพิ่ม "${newName.trim()}" ได้`});
            });
        }
    }
    
    setOpen(false);
    setInputValue("");
  }


  return (
    <>
      <Popover open={open} onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (!isOpen) setInputValue(""); 
      }}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            {value || "เลือกบริษัทขนส่ง..."}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
          <Command shouldFilter={false}>
            <CommandInput 
              placeholder="ค้นหาหรือเพิ่มใหม่..." 
              value={inputValue}
              onValueChange={setInputValue}
            />
            <CommandList>
              {isLoading && <div className="p-4 text-sm text-center text-muted-foreground">กำลังโหลด...</div>}
              {!isLoading && filteredCarriers.length === 0 && !showCreateOption && (
                <CommandEmpty>ไม่พบข้อมูล</CommandEmpty>
              )}
              <CommandGroup>
                {filteredCarriers.map((carrier) => (
                  <CommandItem
                    key={carrier.id}
                    value={carrier.name}
                    className="group flex justify-between items-center pr-2"
                    onSelect={() => handleSelect(carrier.name)}
                  >
                    <div className="flex items-center">
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === carrier.name ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <span className="truncate">{carrier.name}</span>
                    </div>
                    {user && ['super_admin', 'admin'].includes(user.role) && (
                      <div
                        className="p-1 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity rounded-md"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCarrierToDelete(carrier);
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
              คุณแน่ใจหรือไม่ว่าต้องการลบ "{carrierToDelete?.name}"? การกระทำนี้ไม่สามารถย้อนกลับได้
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
