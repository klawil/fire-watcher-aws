export interface ColumnConfig {
	html?: string;
	filter?: boolean;
	create?: (td: HTMLTableCellElement) => any,
	classList?: string[];
}

export interface RowConfig {
	id?: string;
	columns: ColumnConfig[];
}

export function createTableRow(tbody: HTMLElement | null, rowConfig: RowConfig) {
	const tr = document.createElement('tr');
	if (tbody !== null)
		tbody.appendChild(tr);

	if (rowConfig.id)
		tr.id = rowConfig.id;

	rowConfig.columns.forEach(column => {
		const td = document.createElement('td');
		tr.appendChild(td);
		
		td.classList.add('align-middle');
		if (column.classList)
			td.classList.add.apply(td.classList, column.classList);

		if (column.html)
			td.innerHTML = column.html;
		else if (column.create)
			column.create(td);
	});

	return tr;
}
