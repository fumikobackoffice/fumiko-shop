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
import { Button } from "@/components/ui/button";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { Supplier } from "@/lib/types";
import { collection, query, where, orderBy } from "firebase/firestore";

export function SupplierCombobox({ field, suppliers: suppliersProp }: { field: any, suppliers?: Supplier[] }) {
  const firestore = useFirestore();
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");

  const suppliersQuery = useMemoFirebase(() => {
    if (suppliersProp || !firestore) return null;
    return query(collection(firestore, 'suppliers'), where('status', '==', 'active'));
  }, [firestore, suppliersProp]);

  const { data: fetchedSuppliers, isLoading: isFetching } = useCollection<Supplier>(suppliersQuery);

  const suppliers = suppliersProp || fetchedSuppliers;
  const isLoading = suppliersProp ? false : isFetching;

  const currentSuppliers = suppliers || [];
  const filteredSuppliers = inputValue
    ? currentSuppliers.filter(supplier =>
        supplier.name.toLowerCase().includes(inputValue.toLowerCase())
      )
    : currentSuppliers;

  const selectedSupplier = suppliers?.find(s => s.id === field.value);

  return (
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
          {selectedSupplier?.name || "เลือกแหล่งจัดซื้อ..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
        <Command shouldFilter={false}>
          <CommandInput 
            placeholder="ค้นหาแหล่งจัดซื้อ..." 
            value={inputValue}
            onValueChange={setInputValue}
          />
          <CommandList>
            {isLoading && <div className="p-4 text-sm text-center text-muted-foreground">กำลังโหลด...</div>}
            {!isLoading && filteredSuppliers.length === 0 && (
              <CommandEmpty>ไม่พบข้อมูล</CommandEmpty>
            )}
            <CommandGroup>
              {filteredSuppliers.map((supplier) => (
                <CommandItem
                  key={supplier.id}
                  value={supplier.name}
                  onSelect={() => {
                    field.onChange(field.value === supplier.id ? "" : supplier.id);
                    setOpen(false);
                    setInputValue("");
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      field.value === supplier.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="truncate">{supplier.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
