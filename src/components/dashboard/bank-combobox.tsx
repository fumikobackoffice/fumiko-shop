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
import { useState, useEffect, useTransition } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { Bank, UserProfile } from "@/lib/types";
import { bankNames as initialBankNames } from "@/lib/banks";
import { collection, query, orderBy, limit, getDocs, writeBatch, doc, where, deleteDoc } from "firebase/firestore";

export function BankCombobox({ field, disabled }: { field: any, disabled?: boolean }) {
  const { user } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bankToDelete, setBankToDelete] = useState<Bank | null>(null);

  const banksQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'banks'), orderBy('name'));
  }, [firestore]);

  const { data: banks, isLoading } = useCollection<Bank>(banksQuery);

  useEffect(() => {
    const seedBanks = async () => {
      if (firestore && user && ['super_admin', 'admin'].includes(user.role) && !isLoading && banks && banks.length === 0) {
        // Double check to prevent race conditions
        const checkSnap = await getDocs(query(collection(firestore, 'banks'), limit(1)));
        if (checkSnap.empty) {
            console.log("Seeding initial banks...");
            const batch = writeBatch(firestore);
            initialBankNames.forEach(bank => {
            const docRef = doc(collection(firestore, "banks"));
            batch.set(docRef, { name: bank.name });
            });
            await batch.commit();
            toast({ title: "รายชื่อธนาคารเริ่มต้นถูกสร้างแล้ว"});
        }
      }
    };
    seedBanks();
  }, [firestore, user, banks, isLoading, toast]);


  const handleDelete = () => {
    if (!bankToDelete || !firestore) return;
    
    startTransition(async () => {
        try {
            const usersRef = collection(firestore, 'users');
            const q = query(usersRef, where("bankName", "==", bankToDelete.name), limit(1));
            const snapshot = await getDocs(q);

            if (!snapshot.empty) {
                toast({ variant: "destructive", title: "ลบธนาคารไม่สำเร็จ", description: `ไม่สามารถลบได้ เนื่องจากมีการใช้งานโดยผู้ใช้อย่างน้อย 1 คน` });
                setDialogOpen(false);
                return;
            }

            await deleteDoc(doc(firestore, 'banks', bankToDelete.id));

            toast({ title: "ลบธนาคารสำเร็จ", description: `ธนาคาร "${bankToDelete.name}" ถูกลบแล้ว`});
            if (field.value === bankToDelete.name) {
                field.onChange("");
            }
        } catch (e: any) {
            console.error("Error deleting bank:", e);
            toast({ variant: "destructive", title: "เกิดข้อผิดพลาด", description: e.message || "ไม่สามารถลบธนาคารได้" });
        } finally {
            setBankToDelete(null);
            setDialogOpen(false);
        }
    });
  };

  const currentBanks = banks || [];
  const filteredBanks = inputValue
    ? currentBanks.filter(bank =>
        bank.name.toLowerCase().includes(inputValue.toLowerCase())
      )
    : currentBanks;
  
  const showCreateOption = user && ['super_admin', 'admin'].includes(user.role) && inputValue.trim() !== '' && !currentBanks.some(bank => bank.name.toLowerCase() === inputValue.trim().toLowerCase());

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
            disabled={disabled}
          >
            {field.value || "เลือกธนาคาร..."}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
          <Command shouldFilter={false}>
            <CommandInput 
              placeholder="ค้นหาธนาคาร..." 
              value={inputValue}
              onValueChange={setInputValue}
            />
            <CommandList>
              {isLoading && <div className="p-4 text-sm text-center text-muted-foreground">กำลังโหลด...</div>}
              {!isLoading && filteredBanks.length === 0 && !showCreateOption && (
                <CommandEmpty>ไม่พบธนาคาร</CommandEmpty>
              )}
              <CommandGroup>
                {filteredBanks.map((bank) => (
                  <CommandItem
                    key={bank.id}
                    value={bank.name}
                    className="group flex justify-between items-center pr-2"
                    onSelect={() => {
                      field.onChange(field.value === bank.name ? "" : bank.name);
                      setOpen(false);
                      setInputValue("");
                    }}
                  >
                    <div className="flex items-center">
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          field.value === bank.name ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <span className="truncate">{bank.name}</span>
                    </div>
                    {user && ['super_admin', 'admin'].includes(user.role) && (
                      <div
                        className="p-1 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity rounded-md"
                        onClick={(e) => {
                          e.stopPropagation();
                          setBankToDelete(bank);
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
                        const newBankName = inputValue.trim();
                        field.onChange(newBankName);
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
              คุณแน่ใจหรือไม่ว่าต้องการลบธนาคาร "{bankToDelete?.name}"? การกระทำนี้ไม่สามารถย้อนกลับได้
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
