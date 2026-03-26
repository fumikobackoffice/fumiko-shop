
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
import { Check, ChevronsUpDown, User, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { getActiveSellersForCombobox } from "@/app/actions";

interface UserComboboxProps {
    value?: string;
    initialName?: string;
    onChange: (userId: string, userName: string) => void;
    placeholder?: string;
    disabled?: boolean;
}

export function UserCombobox({ value, initialName, onChange, placeholder = "เลือกเจ้าของสาขา...", disabled }: UserComboboxProps) {
  const { user: currentUser, loading: authLoading } = useAuth();
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [users, setUsers] = useState<{ id: string, name: string, email: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Use Server Action to fetch users decisively, bypassing client-side Security Rules for listings
  const fetchSellers = useCallback(async () => {
    if (authLoading || !currentUser || !['super_admin', 'admin'].includes(currentUser.role)) {
        return;
    }
    
    setIsLoading(true);
    try {
        const data = await getActiveSellersForCombobox();
        setUsers(data);
    } catch (error) {
        console.error("Failed to fetch sellers via action:", error);
    } finally {
        setIsLoading(false);
    }
  }, [currentUser, authLoading]);

  // Fetch users on mount if there's a pre-selected value
  useEffect(() => {
    if (value && users.length === 0) {
        fetchSellers();
    }
  }, [value, users.length, fetchSellers]);

  useEffect(() => {
    if (open && users.length === 0) {
        fetchSellers();
    }
  }, [open, users.length, fetchSellers]);

  const currentUsers = users || [];
  const filteredUsers = inputValue
    ? currentUsers.filter(user =>
        user.name.toLowerCase().includes(inputValue.toLowerCase()) ||
        user.email.toLowerCase().includes(inputValue.toLowerCase())
      )
    : currentUsers;

  const selectedUser = users?.find(u => u.id === value);

  // Decide the label to show
  let labelText = placeholder;
  if (selectedUser) {
    labelText = `${selectedUser.name} (${selectedUser.email})`;
  } else if (value && initialName) {
    labelText = initialName;
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
            <div className="flex items-center gap-2 overflow-hidden">
              <User className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate">
                  {labelText}
              </span>
            </div>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
          <Command shouldFilter={false}>
            <CommandInput 
              placeholder="ค้นหาด้วยชื่อหรืออีเมล..." 
              value={inputValue}
              onValueChange={setInputValue}
            />
            <CommandList>
              {isLoading && (
                  <div className="p-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      กำลังโหลดรายชื่อ...
                  </div>
              )}
              {!isLoading && filteredUsers.length === 0 && (
                <CommandEmpty>ไม่พบรายชื่อผู้ใช้งาน</CommandEmpty>
              )}
              <CommandGroup>
                {filteredUsers.map((user) => (
                  <CommandItem
                    key={user.id}
                    value={user.id}
                    onSelect={() => {
                      onChange(user.id, user.name);
                      setOpen(false);
                      setInputValue("");
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === user.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex flex-col">
                      <span className="font-medium">{user.name}</span>
                      <span className="text-xs text-muted-foreground">{user.email}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  );
}
