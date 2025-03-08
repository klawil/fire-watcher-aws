interface ColumnConfig {
	html?: string;
	filter?: boolean;
	create?: (td: HTMLTableCellElement) => any,
}

interface RowConfig {
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

		if (column.html)
			td.innerHTML = column.html;
		else if (column.create)
			column.create(td);
	});

	return tr;
}
