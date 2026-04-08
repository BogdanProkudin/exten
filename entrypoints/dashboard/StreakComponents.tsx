export function Streak({ count }: { count: number }) {
  if (count === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <div className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
          <path d="M12 2C12 2 7 8.5 7 13C7 16.5 9.24 19 12 19C14.76 19 17 16.5 17 13C17 8.5 12 2 12 2Z" />
          <path d="M12 19C10.5 19 9 17.5 9 15.5C9 13 12 10 12 10C12 10 15 13 15 15.5C15 17.5 13.5 19 12 19Z" fillOpacity="0.4" />
        </svg>
      </div>
      <div>
        <div className="text-lg font-bold text-orange-500">{count}</div>
        <div className="text-[11px] text-gray-400 leading-none -mt-0.5">day streak</div>
      </div>
    </div>
  );
}
