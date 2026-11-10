import { Bell, CircleAlert, CircleCheck, CircleX, Clock } from "lucide-react";

export function kindIcon(kind: string) {
  switch (kind) {
    case "approval":
      return <CircleCheck className="size-4 text-success" aria-hidden="true" />;
    case "rejection":
      return <CircleX className="size-4 text-danger" aria-hidden="true" />;
    case "anomaly":
      return <CircleAlert className="size-4 text-danger" aria-hidden="true" />;
    case "reminder":
      return <Clock className="size-4 text-warning" aria-hidden="true" />;
    default:
      return <Bell className="size-4 text-muted-foreground" aria-hidden="true" />;
  }
}
