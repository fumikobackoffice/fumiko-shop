'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useFirestore, useDoc, useCollection, useMemoFirebase } from '@/firebase';
import { doc, collection } from 'firebase/firestore';
import { StoreSettings, TargetedAnnouncement } from '@/lib/types';
import { regions } from '@/lib/provinces';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle2, X, Search, FileSignature, Info } from 'lucide-react';
import Image from 'next/image';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type UnifiedTask = {
  id: string;
  source: 'QUIZ' | 'TARGETED';
  title: string;
  content?: string;
  imageUrl?: string;
  quizQuestions?: any[];
  version: string | number;
};

export function MandatoryQuizModal() {
  const { user } = useAuth();
  const firestore = useFirestore();
  const [isOpen, setIsOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const { toast } = useToast();
  
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [showQuizError, setShowQuizError] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  
  // Track completions securely in state so we can queue down
  const [completedTaskIds, setCompletedTaskIds] = useState<string[]>([]);

  const settingsRef = useMemoFirebase(() => firestore ? doc(firestore, 'settings', 'store') : null, [firestore]);
  const { data: storeSettings } = useDoc<StoreSettings>(settingsRef);

  const targetedRef = useMemoFirebase(() => firestore ? collection(firestore, 'targeted_announcements') : null, [firestore]);
  const { data: targetedAnns } = useCollection<TargetedAnnouncement>(targetedRef);

  // Derive pending tasks (Quizzes + Targeted Announcements)
  const pendingTasks = useMemo(() => {
    if (!user || user.role !== 'seller') return [];
    
    const tasks: UnifiedTask[] = [];

    // 1. Quizzes
    if (storeSettings?.mandatoryQuizzes) {
      storeSettings.mandatoryQuizzes.filter(q => q.active).forEach(q => {
        const version = q.updatedAt?.seconds || 'default';
        const storageKey = `mandatory-quiz-passed-${q.id}-${version}`;
        if (!localStorage.getItem(storageKey) && !completedTaskIds.includes(q.id)) {
          tasks.push({
            id: q.id,
            source: 'QUIZ',
            title: q.title,
            content: q.content,
            imageUrl: q.imageUrl,
            quizQuestions: q.questions,
            version
          });
        }
      });
    }

    // 2. Targeted Announcements
    if (targetedAnns) {
      targetedAnns.filter(ta => ta.active).forEach(ta => {
        // Filter by target logic
        let matches = false;
        if (ta.targetType === 'ALL_SELLERS') matches = true;
        else if (ta.targetType === 'BY_PROVINCE' && ta.targetProvinces?.includes(user.province || '')) matches = true;
        else if (ta.targetType === 'SPECIFIC_USERS' && ta.targetUserIds?.includes(user.id)) matches = true;
        else if (ta.targetType === 'BY_REGION') {
          // Check region mapping
          const userRegion = Object.keys(regions).find(r => regions[r as keyof typeof regions].includes(user.province || ''));
          if (userRegion && ta.targetRegions?.includes(userRegion)) matches = true;
        }

        if (matches) {
          const version = ta.updatedAt?.seconds || 'default';
          const storageKey = `targeted-ann-read-${ta.id}-${version}`;
          if (!localStorage.getItem(storageKey) && !completedTaskIds.includes(ta.id)) {
            tasks.push({
              id: ta.id,
              source: 'TARGETED',
              title: ta.title,
              content: ta.content,
              imageUrl: ta.imageUrl,
              version
            });
          }
        }
      });
    }
    
    return tasks;
  }, [user, storeSettings, targetedAnns, completedTaskIds]);

  useEffect(() => {
    if (pendingTasks.length > 0) {
      setIsOpen(true);
      setCurrentTaskIndex(0);
      setCurrentQuestionIndex(0);
      setSelectedOption(null);
      setShowQuizError(false);
    } else {
      setIsOpen(false);
    }
  }, [pendingTasks]);

  if (!isOpen || pendingTasks.length === 0) return null;

  const currentTask = pendingTasks[currentTaskIndex];
  if (!currentTask) return null;
  
  const questions = currentTask.quizQuestions || [];
  const currentQuestion = questions[currentQuestionIndex];

  const handleTaskComplete = () => {
    // Save locally
    const prefix = currentTask.source === 'QUIZ' ? 'mandatory-quiz-passed' : 'targeted-ann-read';
    const storageKey = `${prefix}-${currentTask.id}-${currentTask.version}`;
    localStorage.setItem(storageKey, 'true');
    
    // Mark completed this session
    setCompletedTaskIds(prev => [...prev, currentTask.id]);
    
    setCurrentQuestionIndex(0);
    setSelectedOption(null);
    setShowQuizError(false);

    if (pendingTasks.length > 1) {
      toast({ 
        title: '✅ รับทราบข้อมูล!', 
        description: 'กำลังพาท่านไปสู่เรื่องถัดไป...',
        className: 'bg-emerald-500 text-white border-none'
      });
    } else {
      toast({ 
        title: '✅ ดำเนินการครบถ้วน!', 
        description: 'ขอบคุณที่อัปเดตข้อมูลสำคัญกับเราครับ',
        className: 'bg-primary text-primary-foreground border-none'
      });
      setIsOpen(false);
    }
  };

  const handleActionClick = () => {
    if (currentTask.source === 'TARGETED') {
      handleTaskComplete();
      return;
    }

    if (currentTask.source === 'QUIZ') {
      if (selectedOption === null) {
        toast({ variant: 'destructive', title: 'กรุณาเลือกคำตอบก่อน' });
        return;
      }
      
      if (selectedOption === currentQuestion.correctOptionIndex) {
        if (currentQuestionIndex < questions.length - 1) {
          toast({ 
            title: '✅ ตอบถูกต้อง!', 
            description: 'ไปสู่คำถามถัดไป...',
            className: 'bg-emerald-500 text-white border-none'
          });
          setCurrentQuestionIndex(prev => prev + 1);
          setSelectedOption(null);
          setShowQuizError(false);
        } else {
          handleTaskComplete();
        }
      } else {
        setShowQuizError(true);
        toast({ 
          variant: 'destructive', 
          title: '❌ คำตอบยังไม่ถูกต้อง', 
          description: 'กรุณาอ่านรายละเอียดหรือลองใหม่อีกครั้ง' 
        });
      }
    }
  };

  const isTargetedType = currentTask.source === 'TARGETED';

  return (
    <>
      <Dialog open={isOpen} onOpenChange={() => {}}>
        <DialogContent 
          className="max-w-xl overflow-hidden p-0 gap-0"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          {currentTask.title && (
            <DialogHeader className={cn("p-6 border-b", isTargetedType ? "bg-blue-50 border-blue-100" : "bg-emerald-50 border-emerald-100")}>
              <div className="flex items-center gap-3">
                <div className={cn("p-2 rounded-full shrink-0", isTargetedType ? "bg-blue-200 text-blue-700" : "bg-emerald-200 text-emerald-700")}>
                  {isTargetedType ? <Info className="h-5 w-5" /> : <FileSignature className="h-5 w-5" />}
                </div>
                <div className="flex flex-col gap-1">
                  <DialogTitle className={cn("text-xl font-bold font-headline", isTargetedType ? "text-blue-900" : "text-emerald-800")}>
                    {currentTask.title}
                  </DialogTitle>
                  {pendingTasks.length > 1 && (
                    <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full w-fit", 
                      isTargetedType ? "text-blue-600 bg-blue-200/50" : "text-emerald-600 bg-emerald-200/50"
                    )}>
                      ประกาศที่ต้องอ่านทั้งหมด: ชุดที่ 1/{pendingTasks.length}
                    </span>
                  )}
                </div>
              </div>
            </DialogHeader>
          )}
          
          <div className="max-h-[50vh] overflow-y-auto">
            {currentTask.imageUrl && (
              <div 
                className="relative w-full aspect-video border-b cursor-zoom-in group bg-muted/20 flex-shrink-0"
                onClick={() => setIsPreviewOpen(true)}
              >
                <Image 
                  src={currentTask.imageUrl} 
                  alt="Announcement Image" 
                  fill 
                  className="object-contain transition-transform group-hover:scale-[1.01]"
                />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/5">
                  <div className="bg-black/40 text-white p-2 rounded-full">
                    <Search className="h-5 w-5" />
                  </div>
                </div>
              </div>
            )}
            
            {currentTask.content && (
              <div className={cn("p-6", !currentTask.title && !currentTask.imageUrl && "pt-6")}>
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {currentTask.content}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="p-4 bg-muted/30 border-t flex-col gap-4">
            {currentTask.source === 'QUIZ' ? (
              currentQuestion ? (
                <div className="flex flex-col w-full space-y-4">
                  <div className="font-bold text-sm md:text-base text-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-3 rounded-md border border-emerald-200 dark:border-emerald-800">
                    <span className="text-emerald-600 dark:text-emerald-400 mr-2">❓ ข้อที่ {currentQuestionIndex + 1}/{questions.length} :</span> 
                    {currentQuestion.question}
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {(currentQuestion.options || []).map((opt: string, idx: number) => (
                      <button 
                        key={`${currentQuestionIndex}-${idx}`}
                        onClick={() => { setSelectedOption(idx); setShowQuizError(false); }}
                        className={cn(
                          "text-left p-3 rounded-lg border transition-all hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20",
                          selectedOption === idx ? "border-emerald-500 bg-emerald-50/50 ring-1 ring-emerald-500" : "border-border bg-background",
                          showQuizError && selectedOption === idx ? "border-destructive bg-destructive/10 ring-1 ring-destructive" : ""
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-5 h-5 rounded-full border flex items-center justify-center shrink-0",
                            selectedOption === idx ? "border-emerald-500" : "border-muted-foreground",
                            showQuizError && selectedOption === idx ? "border-destructive" : ""
                          )}>
                              {selectedOption === idx && <div className={cn("w-2.5 h-2.5 rounded-full", showQuizError ? "bg-destructive" : "bg-emerald-500")} />}
                          </div>
                          <span className="text-sm font-medium">{opt}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                  <Button onClick={handleActionClick} className="w-full font-bold h-11 mt-2 bg-emerald-600 hover:bg-emerald-700 text-white" disabled={selectedOption === null}>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    {currentQuestionIndex < questions.length - 1 ? 'ยืนยันคำตอบ และไปข้อถัดไป' : 'ส่งคำตอบและรับทราบข้อมูล'}
                  </Button>
                </div>
              ) : (
                <div className="w-full text-center text-muted-foreground text-sm">ไม่พบข้อคำถาม กรุณาติดต่อแอดมิน</div>
              )
            ) : (
              // Targeted Announcement UI (Simple Acknowledge)
              <div className="flex flex-col w-full space-y-4">
                <Button onClick={handleActionClick} className="w-full font-bold h-12 text-base shadow-sm">
                  <CheckCircle2 className="mr-2 h-5 w-5" />
                  ฉันได้อ่าน และรับทราบข้อมูลแล้ว
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Full Image Preview Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 border-none bg-transparent shadow-none gap-0 overflow-hidden flex items-center justify-center pointer-events-auto">
          <DialogTitle className="sr-only">รูปภาพประกาศขยายใหญ่</DialogTitle>
          <div className="relative w-full h-[90vh] flex items-center justify-center">
            {currentTask?.imageUrl && (
              <Image 
                src={currentTask.imageUrl} 
                alt="Full Announcement Image" 
                fill 
                className="object-contain"
                priority
              />
            )}
            <Button 
              variant="ghost" 
              size="icon" 
              className="absolute top-4 right-4 text-white bg-black/40 hover:bg-black/60 rounded-full h-10 w-10 z-[100] transition-colors"
              onClick={() => setIsPreviewOpen(false)}
            >
              <X className="h-6 w-6" />
              <span className="sr-only">Close preview</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
