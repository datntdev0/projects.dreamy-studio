import { Component } from "@angular/core";
import { Badge } from "../components/badge";
import { Breadcrumbs, BreadcrumbItem } from "../components/breadcrumbs";
import { Button } from "../components/button";
import { Card } from "../components/card";
import { Chip } from "../components/chip";
import { Datatable, DatatableColumn, DatatableRow } from "../components/datatable";
import { Form, FormOption } from "../components/form";
import { Icon } from "../components/icon";
import { Segments, SegmentOption } from "../components/segments";
import { Toast } from "../components/toast";
import { Tooltip } from "../components/tooltip";

@Component({
  selector: "app-components-page",
  standalone: true,
  imports: [Icon, Button, Form, Segments, Chip, Card, Badge, Toast, Tooltip, Breadcrumbs, Datatable],
  templateUrl: "./components.page.html",
})
export class ComponentsPage {
  view = "grid";
  density = "compact";
  chipSelected = true;
  selectedRow = 1;
  lastBreadcrumb = "";

  readonly viewOptions: SegmentOption[] = [
    { value: "grid", label: "Dạng lưới" },
    { value: "list", label: "Danh sách" },
  ];
  readonly densityOptions: SegmentOption[] = [
    { value: "compact", label: "Gọn" },
    { value: "comfortable", label: "Thoáng" },
    { value: "unavailable", label: "Đã khóa", disabled: true },
  ];
  readonly languageOptions: FormOption[] = [
    { value: "vi", label: "Tiếng Việt" },
    { value: "en", label: "English" },
  ];
  readonly workspacePath: BreadcrumbItem[] = [
    { label: "Workspace", icon: "hdd" },
    { label: "Novel", icon: "book" },
    { label: "Chương 01" },
  ];
  readonly projectPath: BreadcrumbItem[] = [
    { label: "Projects", icon: "folder" },
    { label: "The Lantern Keeper" },
    { label: "Resources" },
  ];
  readonly columns: DatatableColumn[] = [
    { key: "name", label: "Tên" },
    { key: "type", label: "Loại" },
    { key: "status", label: "Trạng thái" },
    { key: "size", label: "Dung lượng", align: "right" },
  ];
  readonly rows: DatatableRow[] = [
    { name: "Chapter 01", type: "Novel", status: "Hoàn tất", size: "12 KB" },
    { name: "Narration.wav", type: "Audio", status: "Đang tạo", size: "48 MB" },
    { name: "Cover.png", type: "Image", status: "Sẵn sàng", size: "2.4 MB" },
  ];
}
