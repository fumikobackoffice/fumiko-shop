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
import { Country } from "@/lib/types";
import { collection, query, orderBy, limit, getDocs, writeBatch, doc, where, deleteDoc } from "firebase/firestore";

interface CountryComboboxProps {
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    className?: string;
}

export function CountryCombobox({ value, onChange, disabled, className }: CountryComboboxProps) {
  const { user } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [countryToDelete, setCountryToDelete] = useState<Country | null>(null);

  const countriesQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'countries'), orderBy('name'));
  }, [firestore]);

  const { data: countries, isLoading } = useCollection<Country>(countriesQuery);

  useEffect(() => {
    const seedCountries = async () => {
      if (firestore && user && ['super_admin', 'admin'].includes(user.role) && !isLoading && countries && countries.length === 0) {
        const checkSnap = await getDocs(query(collection(firestore, 'countries'), limit(1)));
        if (checkSnap.empty) {
            const batch = writeBatch(firestore);
            const docRef = doc(collection(firestore, "countries"));
            batch.set(docRef, { name: "Thailand" });
            await batch.commit();
        }
      }
    };
    seedCountries();
  }, [firestore, user, countries, isLoading]);

  const handleDelete = () => {
    if (!countryToDelete || !firestore) return;
    
    startTransition(async () => {
        try {
            const branchesRef = collection(firestore, 'branches');
            const q = query(branchesRef, where("country", "==", countryToDelete.name), limit(1));
            const snapshot = await getDocs(q);

            if (!snapshot.empty) {
                toast({ variant: "destructive", title: "ลบไม่สำเร็จ", description: `ไม่สามารถลบได้ เนื่องจากมีการใช้งานโดยข้อมูลอื่นในระบบ` });
                setDialogOpen(false);
                return;
            }

            await deleteDoc(doc(firestore, 'countries', countryToDelete.id));

            toast({ title: "ลบประเทศสำเร็จ", description: `"${countryToDelete.name}" ถูกลบแล้ว`});
            if (value === countryToDelete.name) {
                onChange("");
            }
        } catch (e: any) {
            console.error("Error deleting country:", e);
            toast({ variant: "destructive", title: "เกิดข้อผิดพลาด", description: e.message || "ไม่สามารถลบข้อมูลได้" });
        } finally {
            setCountryToDelete(null);
            setDialogOpen(false);
        }
    });
  };

  const currentCountries = countries || [];
  const filteredCountries = inputValue
    ? currentCountries.filter(country =>
        country.name.toLowerCase().includes(inputValue.toLowerCase())
      )
    : currentCountries;
  
  const showCreateOption = user && ['super_admin', 'admin'].includes(user.role) && inputValue.trim() !== '' && !currentCountries.some(country => country.name.toLowerCase() === inputValue.trim().toLowerCase());

  const handleSelect = (countryName: string) => {
    const newName = value === countryName ? "" : countryName;
    onChange(newName);

    if(firestore && user && ['super_admin', 'admin'].includes(user.role)) {
        const exists = currentCountries.some(c => c.name.toLowerCase() === newName.trim().toLowerCase());
        if (!exists && newName.trim() !== '') {
            const batch = writeBatch(firestore);
            const docRef = doc(collection(firestore, 'countries'));
            batch.set(docRef, { name: newName.trim() });
            batch.commit().then(() => {
                toast({ title: 'เพิ่มประเทศใหม่', description: `"${newName.trim()}" ถูกเพิ่มในรายการแล้ว`});
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
            className={cn("w-full justify-between font-normal h-11", className)}
            disabled={disabled}
          >
            {value || "เลือกประเทศ..."}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput 
              placeholder="ค้นหาชื่อประเทศ..." 
              value={inputValue}
              onValueChange={setInputValue}
            />
            <CommandList>
              {isLoading && <div className="p-4 text-sm text-center text-muted-foreground">กำลังโหลด...</div>}
              {!isLoading && filteredCountries.length === 0 && !showCreateOption && (
                <CommandEmpty>ไม่พบข้อมูล</CommandEmpty>
              )}
              <CommandGroup>
                {filteredCountries.map((country) => (
                  <CommandItem
                    key={country.id}
                    value={country.name}
                    className="group flex justify-between items-center pr-2"
                    onSelect={() => handleSelect(country.name)}
                  >
                    <div className="flex items-center">
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === country.name ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <span className="truncate">{country.name}</span>
                    </div>
                    {user && ['super_admin', 'admin'].includes(user.role) && (
                      <div
                        className="p-1 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity rounded-md"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCountryToDelete(country);
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
              คุณแน่ใจหรือไม่ว่าต้องการลบประเทศ "{countryToDelete?.name}"? การกระทำนี้ไม่สามารถย้อนกลับได้
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
