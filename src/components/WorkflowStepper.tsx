import { Check, Clock, ArrowRight } from "lucide-react";
import { WORKFLOW_STEPS, getStepColor } from "@/lib/workflow-engine";
import { cn } from "@/lib/utils";

interface WorkflowStepperProps {
  currentStep: number;
  className?: string;
}

export function WorkflowStepper({ currentStep, className }: WorkflowStepperProps) {
  return (
    <div className={cn("flex items-center gap-1 overflow-x-auto py-2", className)}>
      {WORKFLOW_STEPS.map((step, index) => {
        const isCompleted = step.step < currentStep;
        const isCurrent = step.step === currentStep;
        const isFuture = step.step > currentStep;

        return (
          <div key={step.step} className="flex items-center gap-1 shrink-0">
            <div
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all",
                isCompleted && "bg-success/10 text-success border-success/30",
                isCurrent && getStepColor(step.step),
                isFuture && "bg-muted/50 text-muted-foreground border-border opacity-50"
              )}
            >
              <div className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                isCompleted && "bg-success text-success-foreground",
                isCurrent && "bg-current text-current ring-2 ring-offset-1 ring-primary",
                isFuture && "bg-muted text-muted-foreground"
              )}>
                {isCompleted ? <Check className="h-3 w-3" /> : step.step}
              </div>
              <span className="hidden sm:inline whitespace-nowrap">{step.name}</span>
            </div>
            {index < WORKFLOW_STEPS.length - 1 && (
              <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );
}
