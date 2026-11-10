import { useEffect, useLayoutEffect, useRef } from "react";
import { Check, ChevronDown } from "lucide-react";

// Shared breadcrumb dropdown used by both normal hierarchy routes and the
// development fixture preview. Options are the immediate children of the
// breadcrumb trigger; a leaf breadcrumb remains static when it has no child.
export function HierarchySelector({
  id,
  label,
  options,
  openId,
  setOpenId,
  onSelect,
}) {
  const open = openId === id;
  const triggerRef = useRef(null);
  const optionsRef = useRef(null);
  const pendingFocusRef = useRef(0);
  const ordered = [...options].sort((left, right) => Number(right.current) - Number(left.current));

  useLayoutEffect(() => {
    if (!open || !optionsRef.current) return undefined;
    const positionWithinViewport = () => {
      const menu = optionsRef.current;
      menu.style.transform = "";
      const rect = menu.getBoundingClientRect();
      const edge = 16;
      const shift = rect.left < edge
        ? edge - rect.left
        : rect.right > window.innerWidth - edge
          ? window.innerWidth - edge - rect.right
          : 0;
      menu.style.transform = shift ? `translateX(${shift}px)` : "";
    };
    positionWithinViewport();
    window.addEventListener("resize", positionWithinViewport);
    return () => window.removeEventListener("resize", positionWithinViewport);
  }, [open]);

  useEffect(() => {
    if (!open || pendingFocusRef.current === 0) return;
    const buttons = optionsRef.current?.querySelectorAll("button");
    if (buttons?.length) {
      const index = pendingFocusRef.current < 0 ? buttons.length - 1 : 0;
      buttons[index].focus();
    }
    pendingFocusRef.current = 0;
  }, [open]);

  if (options.length === 0) {
    return (
      <span className="hierarchy-selector">
        <span className="hierarchy-selector-trigger hierarchy-selector-static">{label}</span>
      </span>
    );
  }

  const closeAndRestoreFocus = () => {
    setOpenId("");
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const handleTriggerKeyDown = (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    pendingFocusRef.current = event.key === "ArrowUp" ? -1 : 1;
    if (open) {
      const buttons = optionsRef.current?.querySelectorAll("button");
      buttons?.[event.key === "ArrowUp" ? buttons.length - 1 : 0]?.focus();
      pendingFocusRef.current = 0;
    } else {
      setOpenId(id);
    }
  };

  const handleOptionsKeyDown = (event) => {
    const buttons = [...(optionsRef.current?.querySelectorAll("button") || [])];
    const currentIndex = buttons.indexOf(document.activeElement);
    let nextIndex = null;
    if (event.key === "ArrowDown") nextIndex = (currentIndex + 1) % buttons.length;
    if (event.key === "ArrowUp") nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = buttons.length - 1;
    if (event.key === "Escape") {
      event.preventDefault();
      closeAndRestoreFocus();
      return;
    }
    if (nextIndex !== null && buttons.length) {
      event.preventDefault();
      buttons[nextIndex].focus();
    }
  };

  return (
    <span className="hierarchy-selector">
      <button
        type="button"
        className="hierarchy-selector-trigger"
        aria-expanded={open}
        aria-controls={`${id}-options`}
        ref={triggerRef}
        onClick={() => setOpenId(open ? "" : id)}
        onKeyDown={handleTriggerKeyDown}
      >
        {label}<ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <span
          className="hierarchy-selector-options"
          id={`${id}-options`}
          ref={optionsRef}
          onKeyDown={handleOptionsKeyDown}
        >
          {ordered.map((option) => (
            <button
              type="button"
              className={option.current ? "is-current" : ""}
              aria-current={option.current ? "true" : undefined}
              key={option.value}
              onClick={() => {
                setOpenId("");
                onSelect(option);
              }}
            >
              <span>{option.label}</span>{option.current && <Check size={18} aria-hidden="true" />}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
