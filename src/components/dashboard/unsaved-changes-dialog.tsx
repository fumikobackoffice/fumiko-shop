'use client';

import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogCancel,
    AlertDialogAction
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface UnsavedChangesDialogProps {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    onSaveAndExit: () => Promise<void> | void;
    onDiscardAndExit: () => void;
    isSaving: boolean;
}

export function UnsavedChangesDialog({ isOpen, onOpenChange, onSaveAndExit, onDiscardAndExit, isSaving }: UnsavedChangesDialogProps) {
    return (
        <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>ยังไม่ได้บันทึกการเปลี่ยนแปลง</AlertDialogTitle>
                    <AlertDialogDescription>
                        คุณมีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก คุณต้องการบันทึกก่อนออกจากหน้านี้หรือไม่?
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
                     <Button variant="outline" onClick={onDiscardAndExit}>
                        ออกโดยไม่บันทึก
                    </Button>
                    <AlertDialogAction onClick={onSaveAndExit} disabled={isSaving}>
                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        บันทึกและออก
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
