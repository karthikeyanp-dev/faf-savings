import { m, AnimatePresence } from "framer-motion";
import { useLocation } from "react-router-dom";
import { Children, ReactNode, isValidElement } from "react";

interface PageTransitionProps {
  children: ReactNode;
}

const pageVariants = {
  initial: {
    opacity: 0,
    y: 20,
    scale: 0.98,
  },
  in: {
    opacity: 1,
    y: 0,
    scale: 1,
  },
  out: {
    opacity: 0,
    y: -20,
    scale: 0.98,
  },
};

const pageTransition = {
  type: "spring" as const,
  stiffness: 300,
  damping: 30,
};

export function PageTransition({ children }: PageTransitionProps) {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <m.div
        key={location.pathname}
        initial="initial"
        animate="in"
        exit="out"
        variants={pageVariants}
        transition={pageTransition}
        className="h-full"
      >
        {children}
      </m.div>
    </AnimatePresence>
  );
}

// Staggered list animation wrapper. With 30+ rows the cascade noticeably
// delays first paint, so the first STAGGER_LIMIT children get the
// entrance animation and the rest render statically.
const STAGGER_LIMIT = 10;

interface StaggerContainerProps {
  children: ReactNode;
  className?: string;
  staggerDelay?: number;
  delay?: number;
}

export function StaggerContainer({
  children,
  className = "",
  staggerDelay = 0.05,
  delay = 0,
}: StaggerContainerProps) {
  // Flatten the children so we can decide per-element whether to wrap
  // it in a StaggerItem. React Fragments and arrays are common here.
  const arr = Children.toArray(children);
  return (
    <m.div
      initial="hidden"
      animate="visible"
      variants={{
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: {
            delayChildren: delay,
            staggerChildren: staggerDelay,
          },
        },
      }}
      className={className}
    >
      {arr.map((child, i) => {
        if (i < STAGGER_LIMIT) {
          return (
            <StaggerItem key={isValidElement(child) && child.key ? child.key : i}>
              {child}
            </StaggerItem>
          );
        }
        // Render the tail as plain children so the cascade doesn't
        // extend animation work past the 10th item.
        return <FragmentLike key={i}>{child}</FragmentLike>;
      })}
    </m.div>
  );
}

// Individual stagger item
interface StaggerItemProps {
  children: ReactNode;
  className?: string;
}

export function StaggerItem({ children, className = "" }: StaggerItemProps) {
  return (
    <m.div
      variants={{
        hidden: { opacity: 0, y: 20, scale: 0.95 },
        visible: {
          opacity: 1,
          y: 0,
          scale: 1,
          transition: {
            type: "spring",
            stiffness: 350,
            damping: 25,
          },
        },
      }}
      className={`w-full ${className}`}
    >
      {children}
    </m.div>
  );
}

// Tap/press animation wrapper for interactive elements
interface TapScaleProps {
  children: ReactNode;
  className?: string;
  scale?: number;
  onClick?: () => void;
}

export function TapScale({
  children,
  className = "",
  scale = 0.97,
  onClick,
}: TapScaleProps) {
  return (
    <m.div
      whileTap={{ scale }}
      whileHover={{ scale: 1.01 }}
      transition={{ type: "spring", stiffness: 400, damping: 20 }}
      className={`inline-flex shrink-0 ${className}`}
      onClick={onClick}
    >
      {children}
    </m.div>
  );
}

// A zero-cost wrapper that just renders its children. Used as the
// passthrough for StaggerContainer children past the first
// STAGGER_LIMIT so we don't pay the Framer Motion cost per extra row.
function FragmentLike({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
