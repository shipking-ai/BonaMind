import React from 'react';
import { BlockMath, InlineMath } from 'react-katex';
import 'katex/dist/katex.min.css';

type MathRichTextProps = {
  text: string;
  block?: boolean;
};

const PlainTextSegment = ({ text, block = false }: MathRichTextProps) => {
  const Wrapper = block ? 'div' : 'span';
  return <Wrapper className="whitespace-pre-wrap text-current">{text}</Wrapper>;
};

const MathRichText = ({ text, block = false }: MathRichTextProps) => {
  if (!text) {
    const Wrapper = block ? 'div' : 'span';
    return <Wrapper className="whitespace-pre-wrap text-current"></Wrapper>;
  }
  
  const segments = text.split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+\$)/g).filter(Boolean);
  const Wrapper = block ? 'div' : 'span';

  return (
    <Wrapper className="whitespace-pre-wrap text-current">
      {segments.map((segment, index) => {
        if (segment.startsWith('$$') && segment.endsWith('$$')) {
          const expr = segment.slice(2, -2).trim();
          return (
            <BlockMath
              key={`math-block-${index}`}
              math={expr || ' '}
              renderError={() => <PlainTextSegment text={segment} block />}
            />
          );
        }

        if (segment.startsWith('$') && segment.endsWith('$')) {
          const expr = segment.slice(1, -1).trim();
          return (
            <InlineMath
              key={`math-inline-${index}`}
              math={expr || ' '}
              renderError={() => <PlainTextSegment text={segment} />}
            />
          );
        }

        return <span key={`text-${index}`}>{segment}</span>;
      })}
    </Wrapper>
  );
};

export default MathRichText;



