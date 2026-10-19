import React from 'react';
import '../../styles/theme.css';

const Input = React.forwardRef(({ type = 'text', placeholder, className = '', ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={`input ${className}`}
      type={type}
      placeholder={placeholder}
      {...props}
    />
  );
});

export default Input;