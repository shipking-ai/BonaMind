interface Props {
  question: string;
  options: string[];
  correctIndex: number;
  userAnswer?: number;
  onAnswer: (index: number) => void;
}

export default function QuizBlock({ question, options, correctIndex, userAnswer, onAnswer }: Props) {
  const isLocked = userAnswer !== undefined;

  function getOptionClass(index: number): string {
    const base = 'w-full text-left text-sm px-4 py-2.5 rounded-lg border transition-colors duration-150 ';

    if (!isLocked) {
      return base + 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-purple-600 hover:bg-zinc-700 cursor-pointer';
    }

    if (index === userAnswer && index === correctIndex) {
      return base + 'border-green-600 bg-green-950 text-green-300 cursor-default';
    }
    if (index === userAnswer && index !== correctIndex) {
      return base + 'border-red-700 bg-red-950 text-red-300 cursor-default';
    }
    if (index === correctIndex) {
      return base + 'border-green-600/50 bg-green-950/50 text-green-400 cursor-default';
    }
    return base + 'border-zinc-800 bg-zinc-900 text-zinc-600 cursor-default';
  }

  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4 mt-2 space-y-3">
      <p className="text-sm font-medium text-zinc-100">{question}</p>
      <div className="space-y-2">
        {options.map((opt, i) => (
          <button
            key={i}
            disabled={isLocked}
            onClick={() => onAnswer(i)}
            className={getOptionClass(i)}
          >
            <span className="font-mono text-zinc-500 mr-2">{String.fromCharCode(65 + i)}.</span>
            {opt}
          </button>
        ))}
      </div>
      {isLocked && (
        <p className={`text-xs mt-2 ${userAnswer === correctIndex ? 'text-green-400' : 'text-red-400'}`}>
          {userAnswer === correctIndex
            ? 'Correct'
            : `The correct answer was: ${options[correctIndex]}`}
        </p>
      )}
    </div>
  );
}
