import { ReactNode, useEffect, useState } from 'react';

type Direction = 'left' | 'right' | 'none';

interface TransitionWrapperProps {
  children: ReactNode;
  isVisible: boolean;
  enterFrom?: Direction;
  exitTo?: Direction;
  duration?: number;
}

export default function TransitionWrapper({
  children,
  isVisible,
  enterFrom = 'right',
  exitTo = 'left',
  duration = 300,
}: TransitionWrapperProps) {
  const [shouldRender, setShouldRender] = useState(isVisible);
  const [isAnimating, setIsAnimating] = useState(isVisible);

  useEffect(() => {
    let frameId: number | undefined;
    let startAnimationTimer: ReturnType<typeof setTimeout> | undefined;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;

    if (isVisible) {
      frameId = requestAnimationFrame(() => {
        setShouldRender(true);
        startAnimationTimer = setTimeout(() => {
          setIsAnimating(true);
        }, 20);
      });
    } else {
      frameId = requestAnimationFrame(() => {
        setIsAnimating(false);
      });
      hideTimer = setTimeout(() => {
        setShouldRender(false);
      }, duration);
    }

    return () => {
      if (frameId !== undefined) cancelAnimationFrame(frameId);
      if (startAnimationTimer !== undefined) clearTimeout(startAnimationTimer);
      if (hideTimer !== undefined) clearTimeout(hideTimer);
    };
  }, [isVisible, duration]);

  const getTranslateValue = (direction: Direction) => {
    switch (direction) {
      case 'left':
        return '-100%';
      case 'right':
        return '100%';
      case 'none':
        return '0';
      default:
        return '0';
    }
  };

  if (!shouldRender) {
    return null;
  }

  return (
    <div
      style={{
        position: 'absolute',
        width: '100%',
        display: 'flex',
        justifyContent: 'center',
        opacity: isAnimating ? 1 : 0,
        transform: isAnimating
          ? 'translateX(0)'
          : `translateX(${getTranslateValue(isVisible ? enterFrom : exitTo)})`,
        transition: `transform ${duration}ms cubic-bezier(0.4, 0, 0.2, 1), opacity ${duration}ms cubic-bezier(0.4, 0, 0.2, 1)`,
      }}>
      {children}
    </div>
  );
}
