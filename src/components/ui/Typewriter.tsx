import React, { useState, useEffect } from "react";

interface TypewriterProps {
    text: string;
    speed?: number;
    onComplete?: () => void;
    className?: string;
    children?: (text: string) => React.ReactNode;
}

const Typewriter: React.FC<TypewriterProps> = ({
    text,
    speed = 10,
    onComplete,
    className,
    children
}) => {
    const [displayedText, setDisplayedText] = useState("");
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        // Reset when text changes drastically (new solution)
        if (currentIndex > text.length && text !== displayedText) {
            setDisplayedText("");
            setCurrentIndex(0);
            return;
        }
        // If text is totally different from what we expect (e.g. completely new prop), reset
        if (!text.startsWith(displayedText) && displayedText !== "") {
            setDisplayedText("");
            setCurrentIndex(0);
        }
    }, [text]);

    useEffect(() => {
        if (currentIndex < text.length) {
            const timeout = setTimeout(() => {
                setDisplayedText((prev) => prev + text[currentIndex]);
                setCurrentIndex((prev) => prev + 1);
            }, speed);

            return () => clearTimeout(timeout);
        } else if (currentIndex === text.length) {
            if (onComplete) {
                onComplete();
            }
        }
    }, [currentIndex, text, speed, onComplete]);

    if (children) {
        return <>{children(displayedText)}</>;
    }

    return <span className={className}>{displayedText}</span>;
};

export default Typewriter;
