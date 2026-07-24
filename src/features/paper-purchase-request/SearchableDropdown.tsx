import { ChevronDown, LoaderCircle, Search, X } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'

export interface SearchableOption {
  id: string
  label: string
}

interface SearchableDropdownProps {
  label: string
  placeholder: string
  options: SearchableOption[]
  value: string
  disabled?: boolean
  loading?: boolean
  emptyMessage: string
  onChange: (value: string) => void
}

export default function SearchableDropdown({
  label,
  placeholder,
  options,
  value,
  disabled = false,
  loading = false,
  emptyMessage,
  onChange,
}: SearchableDropdownProps) {
  const inputId = useId()
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const selectedOption = options.find((option) => option.id === value)
  const [query, setQuery] = useState(selectedOption?.label ?? '')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setQuery(selectedOption?.label ?? '')
  }, [selectedOption?.label])

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
        setQuery(selectedOption?.label ?? '')
      }
    }

    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => document.removeEventListener('mousedown', closeOnOutsideClick)
  }, [selectedOption?.label])

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return normalizedQuery
      ? options.filter((option) => option.label.toLowerCase().includes(normalizedQuery))
      : options
  }, [options, query])

  const selectOption = (option: SearchableOption) => {
    onChange(option.id)
    setQuery(option.label)
    setOpen(false)
  }

  return (
    <div className="paper-search-field" ref={rootRef}>
      <label htmlFor={inputId}>{label}</label>
      <div className={`paper-search-control${open ? ' is-open' : ''}`}>
        <Search size={15} aria-hidden="true" />
        <input
          id={inputId}
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={open}
          autoComplete="off"
          disabled={disabled}
          placeholder={placeholder}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value)
            if (value) onChange('')
            setOpen(true)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setOpen(false)
              setQuery(selectedOption?.label ?? '')
            } else if (event.key === 'Enter' && open && filteredOptions[0]) {
              event.preventDefault()
              selectOption(filteredOptions[0])
            }
          }}
        />
        {loading ? (
          <LoaderCircle className="paper-search-spinner" size={16} aria-label="Loading" />
        ) : value ? (
          <button
            type="button"
            className="paper-search-clear"
            aria-label={`Clear ${label}`}
            onClick={() => {
              onChange('')
              setQuery('')
              setOpen(true)
            }}
          >
            <X size={15} />
          </button>
        ) : (
          <ChevronDown size={16} aria-hidden="true" />
        )}
      </div>
      {open && !disabled && (
        <div className="paper-search-menu" id={listId} role="listbox">
          {loading ? (
            <p className="paper-search-message"><LoaderCircle className="paper-search-spinner" size={16} />Loading...</p>
          ) : filteredOptions.length ? (
            filteredOptions.map((option) => (
              <button
                type="button"
                role="option"
                aria-selected={option.id === value}
                key={option.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectOption(option)}
              >
                {option.label}
              </button>
            ))
          ) : (
            <p className="paper-search-message">{emptyMessage}</p>
          )}
        </div>
      )}
    </div>
  )
}
