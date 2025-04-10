import Spinner from 'react-bootstrap/Spinner';
import styles from './loadingSpinner.module.css';

export default function LoadingSpinner({
  fullHeight,
}: {
  fullHeight?: boolean
}) {
  return <div
    className='d-flex justify-content-center align-items-center'
    style={fullHeight ? { height: '100%', } : {}}
  >
    <Spinner
      role='status'
      animation='border'
      className={`${styles.spinner} my-4`}
    />
  </div>;
}
