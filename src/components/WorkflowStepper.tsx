import { Check, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useActiveWorkflowSteps } from "@/hooks/useWorkflowSteps";

interface WorkflowStepperProps {
  currentStep: number;
  className?: string;
}

export function WorkflowStepper({ currentStep, className }: WorkflowStepperProps) {
  const { data: steps } = useActiveWorkflowSteps();

  return (
    <div className={cn("flex items-center gap-1 overflow-x-auto py-2", className)}>
      {steps.map((step, index) => {
        const isCompleted = step.step_order < currentStep;
        const isCurrent = step.step_order === currentStep;
        const isFuture = step.step_order > currentStep;

        return (
          <div key={step.id} className="flex items-center gap-1 shrink-0">
            <div
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all",
                isCompleted && "bg-success/10 text-success border-success/30",
                isCurrent && (step.color_class || "bg-primary/10 text-primary border-primary/30"),
                isFuture && "bg-muted/50 text-muted-foreground border-border opacity-50"
              )}
            >
              <div className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                isCompleted && "bg-success text-success-foreground",
                isCurrent && "bg-current text-current ring-2 ring-offset-1 ring-primary",
                isFuture && "bg-muted text-muted-foreground"
              )}>
                {isCompleted ? <Check className="h-3 w-3" /> : step.step_order}
              </div>
              <span className="hidden sm:inline whitespace-nowrap">{step.name}</span>
            </div>
            {index < steps.length - 1 && (
              <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );
}
