import Spinner from "react-bootstrap/Spinner";
import styles from './loadingSpinner.module.css';

export default function LoadingSpinner() {
  return (<div className="d-flex justify-content-center">
    <Spinner
      role="status"
      animation="border"
      className={`${styles.spinner} my-4`}
    />
  </div>)
}