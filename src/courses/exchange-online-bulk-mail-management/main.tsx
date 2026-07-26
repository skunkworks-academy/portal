import React from "react";
import ReactDOM from "react-dom/client";
import { ExchangeBulkMailCourseApp } from "./CourseApp";
import "./course.css";

const rootElement = document.getElementById("root");

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ExchangeBulkMailCourseApp />
    </React.StrictMode>
  );
}
