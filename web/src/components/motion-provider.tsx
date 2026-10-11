"use client";

import { MotionConfig } from "motion/react";

/** Honour the OS "reduce motion" setting for every motion/react animation in the app:
 *  transforms and layout animations are skipped, opacity fades are kept. */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
