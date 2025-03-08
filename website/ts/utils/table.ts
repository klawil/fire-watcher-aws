export interface ColumnConfig {
	html?: string;
	filter?: boolean;
	create?: (td: HTMLTableCellElement) => any,
	classList?: string[];
	id?: string;
}

export interface RowConfig {
	id?: string;
	classList?: string[];
	columns: ColumnConfig[];
}

export function createTableRow(tbody: HTMLElement | null, rowConfig: RowConfig) {
	const tr = document.createElement('tr');
	if (tbody !== null)
		tbody.appendChild(tr);

	if (rowConfig.id)
		tr.id = rowConfig.id;

	if (rowConfig.classList)
		tr.classList.add.apply(tr.classList, rowConfig.classList);

	rowConfig.columns.forEach(column => {
		const td = document.createElement('td');
		tr.appendChild(td);

		if (typeof column.id !== 'undefined')
			td.id = column.id;
		
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
