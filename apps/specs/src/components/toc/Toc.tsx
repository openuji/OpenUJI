import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Menu, ChevronRight } from "lucide-react";
import type { JSX } from "react/jsx-dev-runtime";
import React, { useEffect } from "react";


// Your incoming data shape
export type FlatTocItem = {
  id: string;      // e.g. "h2-abstract"
  text: string;    // e.g. "Abstract"
  depth: number;   // 1,2,3...
};

// Internal nested shape used by the TOC
type TocItem = {
  id: string;
  title: string;
  children?: TocItem[];
};

export function buildNestedToc(flatItems: FlatTocItem[]): TocItem[] {
  const root: TocItem[] = [];
  const stack: { depth: number; node: TocItem }[] = [];

  for (const item of flatItems) {
    const node: TocItem = { id: item.id, title: item.text };

    // Find parent with smaller depth
    while (stack.length > 0 && item.depth <= stack[stack.length - 1].depth) {
      stack.pop();
    }

    if (stack.length === 0) {
      // top-level item
      root.push(node);
    } else {
      const parent = stack[stack.length - 1].node;
      if (!parent.children) parent.children = [];
      parent.children.push(node);
    }

    stack.push({ depth: item.depth, node });
  }

  return root;
}
type LinkRenderer = (
  props: React.AnchorHTMLAttributes<HTMLAnchorElement>
) => JSX.Element;

const DefaultLink: LinkRenderer = (props) => <a {...props} />;

const SheetLink: LinkRenderer = (props) => (
  <SheetClose asChild>
    <a {...props} />
  </SheetClose>
);

interface TocTreeProps {
  items: TocItem[];
  activeId: string | null;
  level?: number;
  LinkComponent?: LinkRenderer;
}
interface TocNodeProps {
  item: TocItem;
  activeId: string | null;
  level: number;
  LinkComponent: LinkRenderer;
}


/* ---------- helpers ---------- */

function flattenTocIds(items: TocItem[]): string[] {
  const ids: string[] = [];
  const walk = (nodes: TocItem[]) => {
    nodes.forEach((item) => {
      ids.push(item.id);
      if (item.children?.length) walk(item.children);
    });
  };
  walk(items);
  return ids;
}

function tocItemContainsId(item: TocItem, id: string | null): boolean {
  if (!id) return false;
  if (item.id === id) return true;
  return item.children?.some((child) => tocItemContainsId(child, id)) ?? false;
}

/* ---------- scroll spy hook ---------- */

function useActiveHeading(ids: string[]) {
  const [activeId, setActiveId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!ids.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter(
          (e) => e.isIntersecting && ids.includes(e.target.id)
        );

        if (!visible.length) return;

        // Pick the element closest to the top
        visible.sort(
          (a, b) => a.boundingClientRect.top - b.boundingClientRect.top
        );

        const newActiveId = visible[0]?.target.id;
        if (newActiveId && newActiveId !== activeId) {
          setActiveId(newActiveId);
        }
      },
      {
        // Adjust rootMargin to tweak when "active" switches
        rootMargin: "0% 0% -70% 0%",
        threshold: 0.1,
      }
    );

    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(",")]);

  return activeId;
}

function TocNode({ item, activeId, level, LinkComponent }: TocNodeProps) {
  const hasChildren = !!item.children?.length;
  const isActive = activeId === item.id;
  const hasActiveDescendant = hasChildren && tocItemContainsId(item, activeId);

  const [open, setOpen] = React.useState(hasActiveDescendant);

  // auto-open branch when one of its descendants becomes active
  React.useEffect(() => {
    if (hasActiveDescendant) setOpen(true);
  }, [hasActiveDescendant]);

  const indentClass =
    level === 0 ? "" : level === 1 ? "ml-2" : "ml-4"; // simple manual indent

  const linkBase =
    "flex-1 rounded-md px-2 py-1 text-left text-sm transition";
  const linkState = isActive
    ? "bg-muted font-medium text-foreground"
    : "text-muted-foreground hover:bg-muted";

  // Highlight parents of an active child slightly stronger
  const parentHighlight =
    !isActive && hasActiveDescendant ? "font-medium text-foreground" : "";

  return (
    <li>
      <div className={`flex items-center gap-1 ${indentClass}`}>
        {hasChildren && (
          <button
            type="button"
            aria-label={open ? "Collapse section" : "Expand section"}
            onClick={() => setOpen((o) => !o)}
            className="inline-flex h-5 w-5 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted"
          >
            <ChevronRight
              className={`h-3 w-3 transition-transform ${
                open ? "rotate-90" : ""
              }`}
            />
          </button>
        )}

        <LinkComponent
          href={`#${item.id}`}
          className={`${linkBase} ${linkState} ${parentHighlight}`}
        >
          {item.title}
        </LinkComponent>
      </div>

      {hasChildren && open && (
        <TocTree
          items={item.children!}
          activeId={activeId}
          level={level + 1}
          LinkComponent={LinkComponent}
        />
      )}
    </li>
  );
}

const TocTree = ({
  items,
  activeId,
  level = 0,
  LinkComponent = DefaultLink,
}: TocTreeProps) => {
  const indentClass =
    level === 0 ? " " : level === 1 ? "ml-2" : "ml-4"; // simple manual indent

return (
    <ul
      className={
        level === 0 ? "space-y-1" : `mt-1 space-y-1 border-l ${indentClass} pl-1 pt-1`
      }
    >
      {items.map((item) => (
        <TocNode
          key={item.id}
          item={item}
          activeId={activeId}
          level={level}
          LinkComponent={LinkComponent}
        />
      ))}
    </ul>
  );}



export const Toc = ({
  items, title = "On this page"}: {
  items: TocItem[]; title?: string;
}) => {
    const allIds = React.useMemo(() => flattenTocIds(items), [items]);
    const tocContainerRef = React.useRef<HTMLDivElement | null>(null);
    const activeId = useActiveHeading(allIds);
    const scrollDir = React.useRef<"up" | "down" | null>(null);

    useEffect(() => {
      let lastScrollY = window.scrollY;

      const onScroll = () => {
        const currentScrollY = window.scrollY;
        if (currentScrollY > lastScrollY) {
          scrollDir.current = "down";
        } else if (currentScrollY < lastScrollY) {
          scrollDir.current = "up";
        }
        lastScrollY = currentScrollY;
      };

      window.addEventListener("scroll", onScroll, { passive: true });
      return () => {
        window.removeEventListener("scroll", onScroll);
      };
    }, []);

    useEffect(() => { 
      const padding = 24;
      const container = tocContainerRef.current;
      if (!container || !activeId) return;

      const activeLink = container.querySelector<HTMLAnchorElement>(
        `a[href="#${activeId}"]`
      );
      if (!activeLink) return;
      
      const linkTop = activeLink.offsetTop;
      const linkBottom = linkTop + activeLink.offsetHeight;
      const containerTop = container.scrollTop;
      const containerBottom = containerTop + container.clientHeight;
      if (linkTop > containerBottom && scrollDir.current === "down") {
        container.scrollTo({ top: linkTop - padding, behavior: "smooth" });
      } 
      else if (linkBottom < containerTop && scrollDir.current === "up") {
         container.scrollTo({ top: linkBottom - container.clientHeight + padding, behavior: "smooth" });
      }

       //console.log('Scrolling TOC to active link:', { linkTop, linkBottom, containerTop, containerBottom });
      
      
    }, [activeId]);

    return (
    <><aside
        className="
          sticky top-0
          hidden
          h-[calc(100svh)]
          w-64 shrink-0
          lg:block
        "
      >
        <div className="border-r bg-sidebar px-4">
          {/* <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {title}
          </h2> */}            
            <div ref={tocContainerRef} className="h-[calc(100svh)] overflow-y-auto py-6" >
              <TocTree items={items} activeId={activeId} />
            </div>            
        </div>
      </aside>
      {/* Mobile: floating hamburger + sheet overlay */}
      <div className="fixed top-4 right-4 z-40 lg:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button
              size="icon"
              variant="outline"
              className="rounded-full shadow-lg"
            >
              <Menu className="h-5 w-5" />
              <span className="sr-only">Open table of contents</span>
            </Button>
          </SheetTrigger>

          <SheetContent side="right" className="w-[85vw] sm:w-96 px-4">
            <SheetHeader>
              {/* <SheetTitle>{title}</SheetTitle> */}
            </SheetHeader> 

            <ScrollArea className="mt-4 h-[calc(100svh-5rem)] pr-3">
              <TocTree
                items={items}
                activeId={activeId}
                LinkComponent={SheetLink}
              />
            </ScrollArea>
          </SheetContent>
        </Sheet>
        </div>
      </>)
}