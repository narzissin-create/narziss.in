import { useEffect, useRef, useState } from "react";

const PIXELS_PER_SECOND = 48;
const MOVING_PORTION = 0.92;

export default function Announcement({ text }) {
  const viewportRef = useRef(null);
  const measureRef = useRef(null);
  const [marquee, setMarquee] = useState({ start: 320, end: -240, duration: 12 });

  useEffect(() => {
    let frame = 0;
    let active = true;

    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!active) return;
        const viewportWidth = viewportRef.current?.clientWidth || 0;
        const textWidth = measureRef.current?.getBoundingClientRect().width || 1;
        const start = Math.ceil(viewportWidth);
        const end = -Math.ceil(textWidth);
        const duration = (start - end) / PIXELS_PER_SECOND / MOVING_PORTION;
        setMarquee((current) => (
          current.start === start
          && current.end === end
          && Math.abs(current.duration - duration) < 0.01
            ? current
            : { start, end, duration }
        ));
      });
    };

    const observer = new ResizeObserver(update);
    if (viewportRef.current) observer.observe(viewportRef.current);
    if (measureRef.current) observer.observe(measureRef.current);
    document.fonts?.ready.then(update).catch(() => {});
    document.fonts?.addEventListener?.("loadingdone", update);
    update();

    return () => {
      active = false;
      observer.disconnect();
      document.fonts?.removeEventListener?.("loadingdone", update);
      cancelAnimationFrame(frame);
    };
  }, [text]);

  return (
    <div className="announcement" ref={viewportRef} role="note" tabIndex="0" aria-label={text}>
      <span className="announcement-measure" ref={measureRef} aria-hidden="true">{text}</span>
      <span className="announcement-static" aria-hidden="true">{text}</span>
      <div className="announcement-marquee" aria-hidden="true">
        <div
          className="announcement-track"
          style={{
            "--announcement-duration": `${marquee.duration}s`,
            "--announcement-start": `${marquee.start}px`,
            "--announcement-end": `${marquee.end}px`,
          }}
        >
          <span className="announcement-item">{text}</span>
        </div>
      </div>
    </div>
  );
}
