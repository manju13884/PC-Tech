import React from 'react';

export type InputProps = {
  label: string;
  value: number | string;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
  readOnly?: boolean;
  isBold?: boolean;
};

const LabelInput: React.FC<InputProps> = ({ 
  label, 
  value, 
  onChange, 
  readOnly = false, 
  isBold = false 
}) => (
  <div className="flex flex-col gap-1">
    <label 
      className={`text-xs ${isBold ? 'text-blue-600 font-semibold' : 'text-gray-700'}`}
    >
      {label}
    </label>
    <input
      type="number"
      value={value as any}
      onChange={onChange}
      readOnly={readOnly}
      maxLength={5}
      className={`px-2 py-2 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 ${
        readOnly ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'
      }`}
    />
  </div>
);

export default LabelInput;
