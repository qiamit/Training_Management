import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { BrandLockup } from "@/components/brand-mark";
import { useAuth } from "@/features/auth/AuthProvider";

export type DashboardNavItem = {
  label: string;
  href: string;
  description?: string;
  icon?: React.ReactNode;
  /** Optional sidebar group label (renders once before this item) */
  section?: string;
  /** Render this section as a collapsible dropdown tab */
  sectionDropdown?: boolean;
  /** Show in user-card dropdown instead of main nav */
  userMenu?: boolean;
};

type NavGroup = {
  key: string;
  section?: string;
  dropdown: boolean;
  items: DashboardNavItem[];
};

function groupNavItems(items: DashboardNavItem[]): NavGroup[] {
  const groups: NavGroup[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (item.section && last?.section === item.section) {
      last.items.push(item);
      if (item.sectionDropdown) last.dropdown = true;
      continue;
    }
    groups.push({
      key: item.section ?? item.href,
      section: item.section,
      dropdown: Boolean(item.sectionDropdown),
      items: [item],
    });
  }
  return groups;
}

function itemIsActive(activeHref: string, item: DashboardNavItem, rootHref?: string) {
  return (
    activeHref === item.href ||
    (item.href !== rootHref && activeHref.startsWith(`${item.href}/`))
  );
}

export type DashboardBrand = {
  name: string;
  logoUrl?: string | null;
  subtitle?: string;
  /** org = full acronym; person = first+last initials */
  markMode?: "org" | "person";
};

export type DashboardShellProps = {
  portalLabel: string;
  portalAccent: "indigo" | "emerald" | "amber";
  userEmail: string;
  userRoleLabel: string;
  userName?: string;
  brand?: DashboardBrand;
  workspaceTitle?: string;
  workspaceControls?: React.ReactNode;
  navItems: DashboardNavItem[];
  children: React.ReactNode;
};

const accentBar: Record<DashboardShellProps["portalAccent"], string> = {
  indigo: "bg-indigo-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
};

const accentSoft: Record<DashboardShellProps["portalAccent"], string> = {
  indigo: "bg-indigo-500/15 text-indigo-200 ring-indigo-400/20",
  emerald: "bg-emerald-500/15 text-emerald-200 ring-emerald-400/20",
  amber: "bg-amber-500/15 text-amber-200 ring-amber-400/20",
};

const accentActive: Record<DashboardShellProps["portalAccent"], string> = {
  indigo: "bg-indigo-500/20 text-white ring-1 ring-indigo-400/30",
  emerald: "bg-emerald-500/20 text-white ring-1 ring-emerald-400/30",
  amber: "bg-amber-500/20 text-white ring-1 ring-amber-400/30",
};

/** Full acronym from organization name, e.g. QIRLPL */
function orgAcronym(name: string) {
  const acronym = name
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((word) => word[0] ?? "")
    .join("")
    .toUpperCase();
  return acronym || "ORG";
}

/** Learner initials, e.g. Yamini Nayak → YN */
function personInitials(name: string) {
  const parts = name
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (parts.length === 0) return "LR";
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  const first = parts[0][0] ?? "";
  const last = parts[parts.length - 1][0] ?? "";
  return `${first}${last}`.toUpperCase();
}

function brandMarkText(brand: DashboardBrand) {
  if (brand.markMode === "person") {
    return personInitials(brand.name);
  }
  return orgAcronym(brand.name);
}

function OrgSidebarMark({
  brand,
  portalAccent,
}: {
  brand: DashboardBrand;
  portalAccent: DashboardShellProps["portalAccent"];
}) {
  const mark = brandMarkText(brand);
  const tone =
    portalAccent === "amber"
      ? "bg-amber-500/20 text-amber-100 ring-amber-400/30"
      : portalAccent === "indigo"
        ? "bg-indigo-500/20 text-indigo-100 ring-indigo-400/30"
        : "bg-emerald-500/20 text-emerald-100 ring-emerald-400/30";

  if (brand.logoUrl) {
    return (
      <div className="flex flex-col items-center gap-2">
        <span className="inline-flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-white ring-1 ring-white/20">
          <img
            src={brand.logoUrl}
            alt=""
            className="h-full w-full object-contain p-1.5"
          />
        </span>
        {brand.markMode === "person" ? (
          <p className="max-w-[11rem] truncate text-center text-xs font-semibold text-white">
            {brand.name}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <span
        className={`inline-flex min-h-14 min-w-14 items-center justify-center rounded-2xl px-3 py-2 text-sm font-black tracking-[0.12em] ring-1 ${tone}`}
        aria-hidden="true"
      >
        {mark}
      </span>
      {brand.markMode === "person" ? (
        <>
          <p className="max-w-[11rem] truncate text-center text-sm font-semibold text-white">
            {brand.name}
          </p>
          {brand.subtitle ? (
            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-400">
              {brand.subtitle}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function OrgBrandLockup({
  brand,
  variant = "light",
  portalAccent = "emerald",
}: {
  brand: DashboardBrand;
  variant?: "dark" | "light";
  portalAccent?: DashboardShellProps["portalAccent"];
}) {
  const isLight = variant === "light";
  const mark = brandMarkText(brand);
  const toneLight =
    portalAccent === "amber"
      ? "bg-amber-500/20 text-amber-100 ring-amber-400/30"
      : portalAccent === "indigo"
        ? "bg-indigo-500/20 text-indigo-100 ring-indigo-400/30"
        : "bg-emerald-500/20 text-emerald-100 ring-emerald-400/30";
  const toneDark =
    portalAccent === "amber"
      ? "bg-amber-50 text-amber-700 ring-amber-200"
      : portalAccent === "indigo"
        ? "bg-indigo-50 text-indigo-700 ring-indigo-200"
        : "bg-emerald-50 text-emerald-700 ring-emerald-200";

  return (
    <div className="flex items-center gap-3">
      {brand.logoUrl ? (
        <span
          className={`inline-flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl ring-1 ${
            isLight ? "bg-white ring-white/20" : "bg-white ring-slate-200"
          }`}
        >
          <img
            src={brand.logoUrl}
            alt={`${brand.name} logo`}
            className="h-full w-full object-contain p-1"
          />
        </span>
      ) : (
        <span
          className={`inline-flex h-11 max-w-[4.5rem] shrink-0 items-center justify-center rounded-xl px-1.5 text-[10px] font-black tracking-wide ring-1 ${
            isLight ? toneLight : toneDark
          }`}
          aria-hidden="true"
        >
          {mark}
        </span>
      )}
    </div>
  );
}

export function DashboardShell({
  portalLabel,
  portalAccent,
  userEmail,
  userRoleLabel,
  userName,
  brand,
  workspaceTitle,
  workspaceControls,
  navItems,
  children,
}: DashboardShellProps) {
  const { signOut } = useAuth();
  const location = useLocation();
  const activeHref = location.pathname;
  const displayName = userName?.trim() || userEmail.split("@")[0] || "User";
  const headerTitle =
    brand?.name?.trim() || workspaceTitle?.trim() || "Workspace";
  const headerSubtitle = `${displayName} Workspace`;
  const mainNavItems = useMemo(
    () => navItems.filter((item) => !item.userMenu),
    [navItems],
  );
  const userMenuItems = useMemo(
    () => navItems.filter((item) => item.userMenu),
    [navItems],
  );
  const rootHref = mainNavItems[0]?.href ?? navItems[0]?.href;
  const navGroups = useMemo(() => groupNavItems(mainNavItems), [mainNavItems]);

  const [openDropdowns, setOpenDropdowns] = useState<Record<string, boolean>>(
    {},
  );
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      return localStorage.getItem("tm-dashboard-sidebar-open") !== "0";
    } catch {
      return true;
    }
  });
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    try {
      localStorage.setItem(
        "tm-dashboard-sidebar-open",
        sidebarOpen ? "1" : "0",
      );
    } catch {
      /* ignore */
    }
  }, [sidebarOpen]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileNavOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    setOpenDropdowns((prev) => {
      const next = { ...prev };
      for (const group of navGroups) {
        if (!group.dropdown || !group.section) continue;
        const childActive = group.items.some((item) =>
          itemIsActive(activeHref, item, rootHref),
        );
        if (childActive) next[group.section] = true;
      }
      return next;
    });
  }, [activeHref, navGroups, rootHref]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!userMenuRef.current?.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setUserMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const userMenuActive = userMenuItems.some((item) =>
    itemIsActive(activeHref, item, rootHref),
  );

  function renderNavLink(item: DashboardNavItem, nested = false) {
    const isActive = itemIsActive(activeHref, item, rootHref);
    return (
      <Link
        key={item.href}
        to={item.href}
        onClick={() => setMobileNavOpen(false)}
        className={`flex items-center gap-3 rounded-lg text-sm font-medium transition ${
          nested ? "px-3 py-2" : "px-3 py-2.5"
        } ${
          isActive
            ? accentActive[portalAccent]
            : "text-slate-300 hover:bg-white/5 hover:text-white"
        }`}
      >
        <span
          className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-[11px] font-bold ${
            isActive
              ? "bg-white/15 text-white"
              : "bg-white/5 text-slate-400"
          }`}
          aria-hidden="true"
        >
          {item.icon ?? item.label.slice(0, 1)}
        </span>
        <span className="leading-tight">
          <span className="block">{item.label}</span>
          {item.description ? (
            <span
              className={`text-[11px] font-normal ${
                isActive ? "text-slate-300" : "text-slate-500"
              }`}
            >
              {item.description}
            </span>
          ) : null}
        </span>
      </Link>
    );
  }

  function SidebarToggleButton({
    className = "",
    light = false,
  }: {
    className?: string;
    light?: boolean;
  }) {
    return (
      <button
        type="button"
        aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
        aria-expanded={sidebarOpen}
        title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
        onClick={() => setSidebarOpen((open) => !open)}
        className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition ${
          light
            ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            : "bg-white/5 text-slate-200 ring-1 ring-white/10 hover:bg-white/10 hover:text-white"
        } ${className}`}
      >
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-5 w-5"
          aria-hidden="true"
        >
          <path d="M3.25 5.5A.75.75 0 014 4.75h12a.75.75 0 010 1.5H4a.75.75 0 01-.75-.75zm0 4.5A.75.75 0 014 9.25h12a.75.75 0 010 1.5H4A.75.75 0 013.25 10zm0 4.5a.75.75 0 01.75-.75h12a.75.75 0 010 1.5H4a.75.75 0 01-.75-.75z" />
        </svg>
      </button>
    );
  }

  return (
    <div className="h-dvh w-full overflow-hidden bg-[#eef2f6] text-slate-900">
      <div className="flex h-full w-full">
        <aside
          className={`hidden h-full shrink-0 flex-col border-r border-slate-800/80 bg-[#0b1220] text-slate-100 transition-[width] duration-200 lg:flex ${
            sidebarOpen ? "w-[272px]" : "w-[64px]"
          }`}
        >
          <div className={`h-1 w-full shrink-0 ${accentBar[portalAccent]}`} />

          <div
            className={`shrink-0 border-b border-white/10 ${
              sidebarOpen ? "px-4 py-4" : "px-2 py-4"
            }`}
          >
            <div
              className={`flex items-center gap-2 ${
                sidebarOpen ? "justify-between" : "justify-center"
              }`}
            >
              <SidebarToggleButton />
              {sidebarOpen ? (
                brand ? (
                  <div className="flex min-w-0 flex-1 justify-center">
                    <OrgSidebarMark brand={brand} portalAccent={portalAccent} />
                  </div>
                ) : (
                  <div className="min-w-0 flex-1">
                    <BrandLockup variant="light" tagline={portalLabel} />
                    <span
                      className={`mt-3 inline-flex rounded-md px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ring-1 ${accentSoft[portalAccent]}`}
                    >
                      {portalLabel}
                    </span>
                  </div>
                )
              ) : null}
            </div>
          </div>

          {sidebarOpen ? (
            <>
              <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-4">
                {navGroups.map((group, groupIndex) => {
                  if (group.dropdown && group.section) {
                    const childActive = group.items.some((item) =>
                      itemIsActive(activeHref, item, rootHref),
                    );
                    const isOpen = openDropdowns[group.section] ?? childActive;
                    return (
                      <div
                        key={group.key}
                        className={groupIndex > 0 ? "mt-3 pt-1" : undefined}
                      >
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          onClick={() =>
                            setOpenDropdowns((prev) => ({
                              ...prev,
                              [group.section!]: !(
                                prev[group.section!] ?? childActive
                              ),
                            }))
                          }
                          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                            childActive
                              ? accentActive[portalAccent]
                              : "text-slate-300 hover:bg-white/5 hover:text-white"
                          }`}
                        >
                          <span
                            className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-[11px] font-bold ${
                              childActive
                                ? "bg-white/15 text-white"
                                : "bg-white/5 text-slate-400"
                            }`}
                            aria-hidden="true"
                          >
                            MT
                          </span>
                          <span className="flex-1 text-left leading-tight">
                            {group.section}
                          </span>
                          <svg
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${
                              isOpen ? "rotate-180" : ""
                            }`}
                            aria-hidden="true"
                          >
                            <path
                              fillRule="evenodd"
                              d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </button>
                        {isOpen ? (
                          <div className="mt-1 ml-4 space-y-0.5 border-l border-white/10 pl-2">
                            {group.items.map((item) =>
                              renderNavLink(item, true),
                            )}
                          </div>
                        ) : null}
                      </div>
                    );
                  }

                  return (
                    <div key={group.key}>
                      {group.section ? (
                        <p
                          className={`${
                            groupIndex === 0 ? "mb-2" : "mb-2 mt-4"
                          } px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500`}
                        >
                          {group.section}
                        </p>
                      ) : groupIndex === 0 ? (
                        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Navigation
                        </p>
                      ) : null}
                      <div className="space-y-1">
                        {group.items.map((item) => renderNavLink(item))}
                      </div>
                    </div>
                  );
                })}
              </nav>

              <div className="mt-auto shrink-0 border-t border-white/10 p-4">
                <div className="rounded-xl bg-white/5 p-3 text-center ring-1 ring-white/10">
                  <div className="relative">
                    {userMenuItems.length > 0 ? (
                      <div
                        className="absolute left-0 top-0 z-10"
                        ref={userMenuRef}
                      >
                        <button
                          type="button"
                          aria-expanded={userMenuOpen}
                          aria-haspopup="menu"
                          title="Settings menu"
                          onClick={() => setUserMenuOpen((open) => !open)}
                          className={`inline-flex h-9 w-9 items-center justify-center rounded-lg transition ${
                            userMenuOpen || userMenuActive
                              ? accentActive[portalAccent]
                              : "bg-white/5 text-slate-300 ring-1 ring-white/10 hover:bg-white/10 hover:text-white"
                          }`}
                        >
                          <svg
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            className="h-4 w-4"
                            aria-hidden="true"
                          >
                            <path
                              fillRule="evenodd"
                              d="M10 3a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm0 5.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM11.5 15.5a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </button>

                        {userMenuOpen ? (
                          <div
                            role="menu"
                            className="absolute bottom-full left-0 z-40 mb-2 w-56 overflow-hidden rounded-xl border border-white/10 bg-[#121a2b] shadow-xl shadow-black/40"
                          >
                            <p className="border-b border-white/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                              Admin menu
                            </p>
                            {userMenuItems.map((item) => {
                              const isActive = itemIsActive(
                                activeHref,
                                item,
                                rootHref,
                              );
                              return (
                                <Link
                                  key={item.href}
                                  role="menuitem"
                                  to={item.href}
                                  onClick={() => setUserMenuOpen(false)}
                                  className={`flex items-center gap-2.5 border-b border-white/5 px-3 py-2.5 text-sm transition last:border-b-0 ${
                                    isActive
                                      ? "bg-white/10 text-white"
                                      : "text-slate-300 hover:bg-white/5 hover:text-white"
                                  }`}
                                >
                                  <span
                                    className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-[10px] font-bold ${
                                      isActive
                                        ? "bg-white/15 text-white"
                                        : "bg-white/5 text-slate-400"
                                    }`}
                                    aria-hidden="true"
                                  >
                                    {item.icon ?? item.label.slice(0, 1)}
                                  </span>
                                  <span className="truncate font-medium">
                                    {item.label}
                                  </span>
                                </Link>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div
                      className={`min-w-0 w-full text-center ${
                        userMenuItems.length > 0 ? "px-10" : ""
                      }`}
                    >
                      <p className="truncate text-sm font-semibold text-white">
                        {displayName}
                      </p>
                      <p className="truncate text-[11px] text-slate-400">
                        {userEmail}
                      </p>
                      <p className="mt-0.5 truncate text-[10px] uppercase tracking-[0.14em] text-slate-500">
                        {userRoleLabel}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void signOut()}
                    className="mt-3 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="shrink-0 border-b border-slate-200/80 bg-[#eef2f6]/95 px-3 py-3 backdrop-blur sm:px-6 sm:py-3.5 lg:px-8">
            <div className="relative flex items-center justify-between gap-2 lg:justify-center">
              <div className="flex min-w-0 items-center gap-2 sm:gap-3 lg:hidden">
                <button
                  type="button"
                  aria-label={mobileNavOpen ? "Close menu" : "Open menu"}
                  aria-expanded={mobileNavOpen}
                  onClick={() => setMobileNavOpen((open) => !open)}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                >
                  <svg
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-5 w-5"
                    aria-hidden="true"
                  >
                    {mobileNavOpen ? (
                      <path d="M5.28 4.22a.75.75 0 00-1.06 1.06L8.94 10l-4.72 4.72a.75.75 0 101.06 1.06L10 11.06l4.72 4.72a.75.75 0 101.06-1.06L11.06 10l4.72-4.72a.75.75 0 00-1.06-1.06L10 8.94 5.28 4.22z" />
                    ) : (
                      <path d="M3.25 5.5A.75.75 0 014 4.75h12a.75.75 0 010 1.5H4a.75.75 0 01-.75-.75zm0 4.5A.75.75 0 014 9.25h12a.75.75 0 010 1.5H4A.75.75 0 013.25 10zm0 4.5a.75.75 0 01.75-.75h12a.75.75 0 010 1.5H4a.75.75 0 01-.75-.75z" />
                    )}
                  </svg>
                </button>
                {brand ? (
                  <OrgBrandLockup
                    brand={brand}
                    variant="dark"
                    portalAccent={portalAccent}
                  />
                ) : (
                  <BrandLockup tagline={portalLabel} />
                )}
              </div>

              <div className="hidden min-w-0 max-w-[min(90%,56rem)] px-12 lg:block">
                <div className="text-center">
                  <p
                    className={`bg-gradient-to-r bg-clip-text text-xl font-bold tracking-tight text-transparent xl:text-2xl 2xl:text-3xl ${
                      portalAccent === "emerald"
                        ? "from-emerald-700 via-teal-600 to-cyan-600"
                        : portalAccent === "amber"
                          ? "from-amber-700 via-orange-600 to-rose-600"
                          : "from-indigo-700 via-violet-600 to-fuchsia-600"
                    }`}
                  >
                    {headerTitle}
                  </p>
                  <p className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">
                    {headerSubtitle}
                  </p>
                </div>
              </div>

              {workspaceControls ? (
                <div className="absolute right-0 hidden items-center lg:flex">
                  {workspaceControls}
                </div>
              ) : null}

              <div className="flex shrink-0 items-center gap-2 lg:hidden">
                {workspaceControls}
                <span className="hidden max-w-[120px] truncate text-xs text-slate-600 sm:inline">
                  {displayName}
                </span>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 sm:px-3"
                >
                  Sign out
                </button>
              </div>
            </div>
          </header>

          <main className="min-h-0 min-w-0 flex-1 overflow-auto px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
            <div className="mx-auto h-full w-full min-w-0 max-w-none">
              {children}
            </div>
          </main>
        </div>
      </div>

      {mobileNavOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-slate-950/50"
            onClick={() => setMobileNavOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-[min(20rem,88vw)] flex-col bg-[#0b1220] text-slate-100 shadow-2xl">
            <div className={`h-1 w-full shrink-0 ${accentBar[portalAccent]}`} />
            <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-4">
              {brand ? (
                <OrgSidebarMark brand={brand} portalAccent={portalAccent} />
              ) : (
                <BrandLockup variant="light" tagline={portalLabel} />
              )}
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setMobileNavOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-slate-200 ring-1 ring-white/10"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
                  <path d="M5.28 4.22a.75.75 0 00-1.06 1.06L8.94 10l-4.72 4.72a.75.75 0 101.06 1.06L10 11.06l4.72 4.72a.75.75 0 101.06-1.06L11.06 10l4.72-4.72a.75.75 0 00-1.06-1.06L10 8.94 5.28 4.22z" />
                </svg>
              </button>
            </div>
            <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-4">
              {navGroups.map((group, groupIndex) => {
                if (group.dropdown && group.section) {
                  const childActive = group.items.some((item) =>
                    itemIsActive(activeHref, item, rootHref),
                  );
                  const isOpen = openDropdowns[group.section] ?? childActive;
                  return (
                    <div
                      key={`m-${group.key}`}
                      className={groupIndex > 0 ? "mt-3 pt-1" : undefined}
                    >
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() =>
                          setOpenDropdowns((prev) => ({
                            ...prev,
                            [group.section!]: !(
                              prev[group.section!] ?? childActive
                            ),
                          }))
                        }
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                          childActive
                            ? accentActive[portalAccent]
                            : "text-slate-300 hover:bg-white/5 hover:text-white"
                        }`}
                      >
                        <span className="flex-1 text-left">{group.section}</span>
                        <svg
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
                          aria-hidden="true"
                        >
                          <path
                            fillRule="evenodd"
                            d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </button>
                      {isOpen ? (
                        <div className="mt-1 ml-3 space-y-0.5 border-l border-white/10 pl-2">
                          {group.items.map((item) => renderNavLink(item, true))}
                        </div>
                      ) : null}
                    </div>
                  );
                }
                return (
                  <div key={`m-${group.key}`}>
                    {group.section ? (
                      <p
                        className={`${
                          groupIndex === 0 ? "mb-2" : "mb-2 mt-4"
                        } px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500`}
                      >
                        {group.section}
                      </p>
                    ) : null}
                    <div className="space-y-1">
                      {group.items.map((item) => renderNavLink(item))}
                    </div>
                  </div>
                );
              })}
              {userMenuItems.length > 0 ? (
                <div className="mt-4 border-t border-white/10 pt-3">
                  <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Admin menu
                  </p>
                  <div className="space-y-1">
                    {userMenuItems.map((item) => renderNavLink(item))}
                  </div>
                </div>
              ) : null}
            </nav>
            <div className="shrink-0 border-t border-white/10 p-4">
              <div className="rounded-xl bg-white/5 p-3 text-center ring-1 ring-white/10">
                <p className="truncate text-sm font-semibold text-white">
                  {displayName}
                </p>
                <p className="truncate text-[11px] text-slate-400">{userEmail}</p>
                <p className="mt-0.5 truncate text-[10px] uppercase tracking-[0.14em] text-slate-500">
                  {userRoleLabel}
                </p>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="mt-3 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200"
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-slate-200/80 pb-3 sm:mb-6 sm:pb-4">
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm text-slate-500">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

export function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`min-w-0 rounded-xl border border-slate-200/90 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-5 ${className}`}
    >
      {children}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
      {message}
    </p>
  );
}

export function StatCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
        {value}
      </p>
    </div>
  );
}
