import { Home, Search, PlusCircle, BarChart3, User, Settings, ClipboardCheck, type LucideProps } from "lucide-react";
import type { NavItem } from "./nav-items";

const ICONS: Record<NavItem["icon"], React.ComponentType<LucideProps>> = {
  home: Home,
  search: Search,
  "plus-circle": PlusCircle,
  "bar-chart": BarChart3,
  user: User,
  settings: Settings,
  "clipboard-check": ClipboardCheck,
};

export function NavIcon({ icon, ...props }: { icon: NavItem["icon"] } & LucideProps) {
  const Icon = ICONS[icon];
  return <Icon {...props} />;
}
