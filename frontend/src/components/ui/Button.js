import '../../styles/theme.css';

const Button = ({ children, onClick, variant = 'primary', type = 'button', className = '' }) => {
  return (
    <button className={`btn btn-${variant} ${className}`} onClick={onClick} type={type}>
      {children}
    </button>
  );
};

export default Button;