'use client';

import { useDarkMode } from "@/logic/clientHooks";
import { PageConfig } from "@/types/page";
import CofrnNavbar from "./navbar";

export default function CofrnLayout({
  children,
  pageConfig,
}: Readonly<{
  children: React.ReactNode;
  pageConfig: PageConfig;
}>) {
  const isDarkMode = useDarkMode();
  if (typeof isDarkMode === 'undefined') return (<></>);

  const modeName = isDarkMode ? 'dark' : 'light';

  return (
    <>
      <CofrnNavbar
        pageConfig={pageConfig}
        modeName={modeName}
      />

      {pageConfig.title && <h1 className="text-center">{pageConfig.title}</h1>}
      {children}
    </>
  );
}
