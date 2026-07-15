import React, { useId } from 'react';

export type InputProps = {
  label: string;
  value: number | string;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
  readOnly?: boolean;
  isBold?: boolean;
  calculated?: boolean;
  placeholder?: string;
};

const LabelInput: React.FC<InputProps> = ({ 
  label, 
  value, 
  onChange, 
  readOnly = false, 
  isBold = false,
  calculated = false,
  placeholder
}) => {
  const inputId = useId();

  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={inputId}
        className={`text-xs ${isBold ? 'text-blue-600 font-semibold' : 'text-gray-700'}`}
      >
        {label}
      </label>
      <input
        id={inputId}
        type="number"
        value={value as any}
        onChange={onChange}
        readOnly={readOnly}
        placeholder={placeholder}
        maxLength={5}
        className={`px-2 py-2 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 ${calculated ? 'calculated-field ' : ''}${
          readOnly ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'
        }`}
      />
    </div>
  );
};

export default LabelInput;
