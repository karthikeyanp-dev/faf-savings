import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "react-router-dom";
import { ReactNode } from "react";

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
      <motion.div
        key={location.pathname}
        initial="initial"
        animate="in"
        exit="out"
        variants={pageVariants}
        transition={pageTransition}
        className="h-full"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

// Staggered list animation wrapper
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
  return (
    <motion.div
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
      {children}
    </motion.div>
  );
}

// Individual stagger item
interface StaggerItemProps {
  children: ReactNode;
  className?: string;
}

export function StaggerItem({ children, className = "" }: StaggerItemProps) {
  return (
    <motion.div
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
    </motion.div>
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
    <motion.div
      whileTap={{ scale }}
      whileHover={{ scale: 1.01 }}
      transition={{ type: "spring", stiffness: 400, damping: 20 }}
      className={`inline-flex shrink-0 ${className}`}
      onClick={onClick}
    >
      {children}
    </motion.div>
  );
}

// Slide up animation for bottom sheets/modals
interface SlideUpProps {
  children: ReactNode;
  className?: string;
}

export function SlideUp({ children, className = "" }: SlideUpProps) {
  return (
    <motion.div
      initial={{ y: "100%", opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: "100%", opacity: 0 }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Fade in animation wrapper
interface FadeInProps {
  children: ReactNode;
  className?: string;
  delay?: number;
}

export function FadeIn({ children, className = "", delay = 0 }: FadeInProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Scale in animation for cards and modals
interface ScaleInProps {
  children: ReactNode;
  className?: string;
  delay?: number;
}

export function ScaleIn({ children, className = "", delay = 0 }: ScaleInProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 25, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Slide in from left
interface SlideInLeftProps {
  children: ReactNode;
  className?: string;
  delay?: number;
}

export function SlideInLeft({
  children,
  className = "",
  delay = 0,
}: SlideInLeftProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -30 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 25, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Slide in from right
interface SlideInRightProps {
  children: ReactNode;
  className?: string;
  delay?: number;
}

export function SlideInRight({
  children,
  className = "",
  delay = 0,
}: SlideInRightProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 25, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Floating animation for decorative elements
interface FloatProps {
  children: ReactNode;
  className?: string;
  duration?: number;
  distance?: number;
}

export function Float({
  children,
  className = "",
  duration = 3,
  distance = 10,
}: FloatProps) {
  return (
    <motion.div
      animate={{
        y: [-distance / 2, distance / 2, -distance / 2],
      }}
      transition={{
        duration,
        repeat: Infinity,
        ease: "easeInOut",
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Pulse animation for notifications/attention
interface PulseProps {
  children: ReactNode;
  className?: string;
}

export function Pulse({ children, className = "" }: PulseProps) {
  return (
    <motion.div
      animate={{
        scale: [1, 1.05, 1],
        opacity: [1, 0.8, 1],
      }}
      transition={{
        duration: 2,
        repeat: Infinity,
        ease: "easeInOut",
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
